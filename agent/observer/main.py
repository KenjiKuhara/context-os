"""
Observer — Level 0 SubAgent MVP

context-os の最初の Python Agent。
「観測し、提案する。決して Apply しない。」

Based on:
  19_SubAgent_Observer.md   — Observer の設計 SSOT
  20_SubAgent_Catalog.md §3 — Level 0 の定義
  25_Boundary_NextJS_PythonAgent.md — 境界線ルール

Skill 利用:
  許可: GET /api/dashboard (読み取り)
        POST /api/nodes/{id}/estimate-status (Preview のみ — confirm_status なし)
  禁止: Apply (confirm_status 送信)
        POST /api/confirmations
        DB 直接操作

出力: ObserverReport (19 §4.2 準拠)
"""

from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import httpx
from dotenv import load_dotenv

load_dotenv()

# ─── 設定 ──────────────────────────────────────────────────
# ベース URL の SSOT: 環境変数 NEXT_BASE_URL（Phase 3-2.1）
# ローカル / Actions / 本番いずれもこの名前で渡す（docs/26, 27 参照）。
# スキーム省略時は https:// を付与（GitHub Secrets で URL だけ設定した場合の救済）。

_raw = os.getenv("NEXT_BASE_URL", "http://localhost:3000")
BASE_URL = (_raw or "").strip() or "http://localhost:3000"
if not (BASE_URL.startswith("http://") or BASE_URL.startswith("https://")):
    BASE_URL = "https://" + BASE_URL
# GitHub Actions で localhost のままなら Secrets 未設定
if os.getenv("GITHUB_ACTIONS") and ("localhost" in BASE_URL or "127.0.0.1" in BASE_URL):
    print("Error: NEXT_BASE_URL is not set for GitHub Actions. Add Secret NEXT_BASE_URL (e.g. https://your-app.vercel.app)", file=sys.stderr)
    sys.exit(1)
OBSERVER_TOKEN = os.getenv("OBSERVER_TOKEN", "")
COOLING_THRESHOLD = int(os.getenv("COOLING_THRESHOLD", "40"))
COOLING_DAYS = int(os.getenv("COOLING_DAYS", "7"))
# Phase 3-4: suggested_next 候補から除外する status（28_Observer_SuggestedNext_Scoring.md）
SUGGESTED_NEXT_EXCLUDED_STATUSES = ("DONE", "COOLING", "CANCELLED")
STALE_DAYS_FOR_SUGGESTED = 7   # この日数以上更新なしで加点
IN_PROGRESS_STALE_DAYS = 3     # IN_PROGRESS でこの日数以上更新なしで加点
TEMPERATURE_LOW_THRESHOLD = 40  # この値以下で加点


# ─── API クライアント・エラー表示（Phase 3-4.3）────────────────
# 25_Boundary §5.1: Python は Next.js Skill API を HTTP で呼ぶ。DB には触れない。
# 秘密情報は出さない。BASE_URL と呼び出し先 URL を必ず stderr で案内する。

def _call_desc(method: str, path: str) -> str:
    """呼び出し先の1行説明（秘密情報なし）。"""
    return f"BASE_URL={BASE_URL}, 呼び出し先: {method} {BASE_URL.rstrip('/')}{path}"


def _parse_body_error(resp: httpx.Response) -> str:
    """レスポンス本文の error を短く返す。"""
    try:
        data = resp.json()
        err = data.get("error")
        return (err[:200] + "…") if err and len(str(err)) > 200 else (str(err) if err else resp.text[:100] or str(resp.status_code))
    except Exception:
        return resp.text[:100] or str(resp.status_code)


def _check_http_error(resp: httpx.Response, method: str, path: str) -> None:
    """4xx/5xx のとき RuntimeError（メッセージに BASE_URL・呼び出し先・status・body error）。"""
    if resp.status_code >= 400:
        err = _parse_body_error(resp)
        msg = f"{_call_desc(method, path)} HTTP {resp.status_code} — {err}"
        raise RuntimeError(msg)


async def fetch_dashboard(client: httpx.AsyncClient) -> dict[str, Any]:
    """GET /api/dashboard — アクティブ Node 一覧を取得。OBSERVER_TOKEN を Bearer で付与。"""
    path = "/api/dashboard"
    url = f"{BASE_URL.rstrip('/')}{path}"
    try:
        resp = await client.get(url, headers=_save_report_headers())
    except httpx.ConnectError as e:
        port_hint = ""
        try:
            p = urlparse(BASE_URL)
            if p.port:
                port_hint = f" ポートは {p.port}。"
            else:
                port_hint = " ポート（例: 3000）を確認。"
        except Exception:
            port_hint = " ポート（例: 3000）を確認。"
        msg = (
            f"{_call_desc('GET', path)} 接続できません。"
            f"Next.js は起動していますか？{port_hint} NEXT_BASE_URL を確認してください。"
        )
        raise RuntimeError(msg) from e
    _check_http_error(resp, "GET", path)
    data = resp.json()
    if not data.get("ok"):
        raise RuntimeError(f"dashboard API error: {data.get('error')}")
    return data["trays"]


async def preview_status(
    client: httpx.AsyncClient,
    node_id: str,
    intent: str,
) -> dict[str, Any]:
    """
    POST /api/nodes/{id}/estimate-status — Preview のみ。

    CRITICAL: confirm_status を送らない。
    これにより DB への副作用ゼロが保証される (17 §5, 19 §3.2)。
    """
    path = f"/api/nodes/{node_id}/estimate-status"
    url = f"{BASE_URL.rstrip('/')}{path}"
    resp = await client.post(url, json={"intent": intent})
    _check_http_error(resp, "POST", path)
    data = resp.json()
    if not data.get("ok"):
        raise RuntimeError(f"estimate-status Preview error: {data.get('error')}")
    return data


# ─── Node ヘルパー ─────────────────────────────────────────
# 28 §2: updated_at の SSOT。dashboard API の node.updated_at / node.created_at のみ使用。

def get_title(node: dict[str, Any]) -> str:
    return node.get("title") or node.get("name") or "(タイトルなし)"


def _parse_iso(s: str) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


def get_effective_updated(node: dict[str, Any]) -> tuple[datetime | None, int | None]:
    """
    SSOT: updated_at があればそれ、なければ created_at。
    戻り値: (effective_dt, days_since)。どちらも無い場合は (None, None)。
    """
    raw = node.get("updated_at") or node.get("created_at")
    dt = _parse_iso(raw) if raw else None
    if dt is None:
        return None, None
    days = (datetime.now(timezone.utc) - dt).days
    return dt, days


def days_since_update(node: dict[str, Any]) -> int | None:
    """get_effective_updated の days のみ返す（冷却検知・intent 用）。"""
    _, days = get_effective_updated(node)
    return days


def normalize_temperature(val: Any) -> int:
    """28 §3: null/undefined → 50。文字列なら数値化してから判定。"""
    if val is None:
        return 50
    if isinstance(val, str):
        try:
            return int(float(val))
        except (ValueError, TypeError):
            return 50
    try:
        return int(val)
    except (ValueError, TypeError):
        return 50


# ─── suggested_next スコアリング（Phase 3-4, docs/28）────────────────

def compute_suggested_next_score(node: dict[str, Any]) -> tuple[int, dict[str, Any], str]:
    """
    候補ノードのスコア・内訳・tie-break 用 effective_ts を返す。
    戻り値: (total, breakdown_dict, effective_ts_for_sort)
    breakdown_dict = { temp, stale, status_bonus, stuck }（28 §4, §5）
    """
    status = node.get("status") or ""
    temp_val = normalize_temperature(node.get("temperature"))
    effective_dt, days = get_effective_updated(node)
    effective_ts = effective_dt.isoformat() if effective_dt else ""

    temp = 30 if temp_val <= TEMPERATURE_LOW_THRESHOLD else 0
    # どちらも無い場合は stale 扱い（28 §2）。7 日以上前も stale。
    no_date = effective_dt is None
    stale = 25 if (no_date or (days is not None and days >= STALE_DAYS_FOR_SUGGESTED)) else 0

    status_bonus = 0
    if status == "WAITING_EXTERNAL":
        status_bonus = 20
    elif status == "CLARIFYING":
        status_bonus = 15
    elif status == "READY":
        status_bonus = 10
    elif status == "NEEDS_DECISION":
        status_bonus = 12
    elif status == "BLOCKED":
        status_bonus = 8

    stuck = 0
    if status == "IN_PROGRESS" and (no_date or (days is not None and days >= IN_PROGRESS_STALE_DAYS)):
        stuck = 15

    total = temp + stale + status_bonus + stuck
    breakdown = {
        "temp": temp,
        "stale": stale,
        "status_bonus": status_bonus,
        "stuck": stuck,
    }
    # tie-break: 日付なしは最後にしたいので、空でない値を使う（asc で古い順のとき '' は先頭になるため）
    sort_ts = effective_ts if effective_ts else "\uffff"  # 辞書順で最後
    return total, breakdown, sort_ts


# next_action テンプレ（28 §7 最低4つ。{title} をノード名で置換）
NEXT_ACTION_TEMPLATES: dict[str, str] = {
    "WAITING_EXTERNAL": "「{title}」の相手に確認する（メール・電話・チャットのどれか 1 本）",
    "CLARIFYING": "「{title}」の不明点を 1 つだけ質問にまとめる",
    "READY": "「{title}」の最初の 10 分でできるタスクを 1 つやる",
    "IN_PROGRESS": "「{title}」で詰まっていないか確認し、次の一手を決める",
    "NEEDS_DECISION": "「{title}」の判断材料を確認し、決断する",
    "BLOCKED": "「{title}」の障害内容を確認し、解消策を検討する",
}
DEFAULT_NEXT_ACTION_TEMPLATE = "「{title}」の context を確認し、次の一手を決める"


def get_next_action_for_status(status: str, title: str) -> str:
    tpl = NEXT_ACTION_TEMPLATES.get(status) or DEFAULT_NEXT_ACTION_TEMPLATE
    return tpl.replace("{title}", title)


# ─── Observer ロジック ─────────────────────────────────────
# 19 §5: 処理フロー
#   1. dashboard で Node 取得
#   2. 各 Node に estimate-status Preview
#   3. temperature / updated_at から冷却検知
#   4. 全体を分析し ObserverReport 構成
#   5. 出力

async def observe() -> dict[str, Any]:
    """Observer のメイン処理。ObserverReport を返す。"""

    async with httpx.AsyncClient(timeout=30.0) as client:
        # ── Step 1: アクティブ Node を取得 ──
        trays = await fetch_dashboard(client)

        all_nodes: list[dict[str, Any]] = []
        for tray_nodes in trays.values():
            all_nodes.extend(tray_nodes)

        if not all_nodes:
            now_utc = datetime.now(timezone.utc)
            meta = {
                "observed_at": now_utc.isoformat(),
                "freshness_minutes": 0,
            }
            return {
                "suggested_next": None,
                "status_proposals": [],
                "cooling_alerts": [],
                "summary": "机の上にノードがありません。",
                "node_count": 0,
                "warnings": [],  # 29: list of { code, message, details? }
                "meta": meta,  # 31: 鮮度表示用
            }

        # ── Step 2: 各 Node に estimate-status Preview ──
        status_proposals: list[dict[str, Any]] = []

        for node in all_nodes:
            node_id = node["id"]
            title = get_title(node)
            current_status = node.get("status", "")
            days = days_since_update(node)

            # intent を構成（観測事実のみ。判断は含めない）
            intent_parts: list[str] = []
            if days is not None:
                intent_parts.append(f"最終更新から{days}日経過")
            temp = node.get("temperature")
            if temp is not None:
                intent_parts.append(f"温度{temp}")
            intent_parts.append(f"現在{current_status}")

            intent = "、".join(intent_parts)

            try:
                preview = await preview_status(client, node_id, intent)
            except Exception:
                # Preview 失敗は無視（観測の一部が欠けるだけ）
                continue

            suggested = preview.get("suggested")
            if suggested and suggested.get("status") != current_status:
                status_proposals.append({
                    "node_id": node_id,
                    "title": title,
                    "current_status": current_status,
                    "suggested_status": suggested["status"],
                    "reason": suggested.get("reason", ""),
                })

        # ── Step 3: 冷却検知 ──
        # 06_Temperature_Spec §4.1: 最終更新日時 + temperature
        cooling_alerts: list[dict[str, Any]] = []

        for node in all_nodes:
            node_id = node["id"]
            title = get_title(node)
            temp = node.get("temperature")
            days = days_since_update(node)  # 28 §2: updated_at else created_at
            effective_dt, _ = get_effective_updated(node)
            last_updated = effective_dt.isoformat() if effective_dt else node.get("updated_at", "")

            is_cooling = False
            reason_parts: list[str] = []

            if temp is not None and temp < COOLING_THRESHOLD:
                is_cooling = True
                reason_parts.append(f"温度が{temp}に低下")

            if days is not None and days >= COOLING_DAYS:
                is_cooling = True
                reason_parts.append(f"{days}日間更新がありません")

            if is_cooling:
                cooling_alerts.append({
                    "node_id": node_id,
                    "title": title,
                    "temperature": temp,
                    "last_updated": last_updated,
                    "message": f"「{title}」は{' / '.join(reason_parts)}。止めてよいですか？",
                })

        # ── Step 4: suggested_next を構成（Phase 3-4, 28 SSOT）──
        # 候補除外 → スコア計算 → tie-break（28 §6）→ 1 件。安全性は 28 §8 のまま。

        candidates = [
            n for n in all_nodes
            if (n.get("status") or "") not in SUGGESTED_NEXT_EXCLUDED_STATUSES
        ]
        suggested_next = None
        if candidates:
            scored: list[tuple[dict[str, Any], int, dict[str, Any], str]] = []
            for node in candidates:
                total, breakdown, sort_ts = compute_suggested_next_score(node)
                scored.append((node, total, breakdown, sort_ts))
            # 28 §6: total 降順 → updated_at 古い順 → node_id 辞書順
            scored.sort(key=lambda x: (-x[1], x[3], x[0].get("id", "")))
            best, total_score, breakdown, _ = scored[0]
            title = get_title(best)
            status = best.get("status", "")
            reason_map = {
                "IN_PROGRESS": "実施中で最もスコアが高いノードです",
                "NEEDS_DECISION": "判断待ちのノードがあります",
                "READY": "着手可能な状態です",
                "BLOCKED": "障害がありますが、解消すれば進められます",
                "WAITING_EXTERNAL": "外部からの返答を確認してみてください",
                "CLARIFYING": "言語化・整理が必要なノードです",
            }
            suggested_next = {
                "node_id": best["id"],
                "title": title,
                "reason": reason_map.get(status, f"{status} のノードです"),
                "next_action": get_next_action_for_status(status, title),
                "debug": {
                    "total": total_score,
                    "breakdown": breakdown,
                    "rule_version": "3-4.0",
                },
            }

        # ── Step 5: node_count（SSOT）と summary 構成 ──
        # 28 品質ルール: node_count は dashboard の Node 数のみ。summary は node_count から生成（数え直さない）。
        node_count = len(all_nodes)
        tray_counts = {k: len(v) for k, v in trays.items()}
        summary_parts = [f"机の上に {node_count} 件のノードがあります"]
        if tray_counts.get("in_progress"):
            summary_parts.append(f"実施中 {tray_counts['in_progress']} 件")
        if tray_counts.get("needs_decision"):
            summary_parts.append(f"判断待ち {tray_counts['needs_decision']} 件")
        if tray_counts.get("waiting_external"):
            summary_parts.append(f"外部待ち {tray_counts['waiting_external']} 件")
        if cooling_alerts:
            summary_parts.append(f"冷却確認 {len(cooling_alerts)} 件")
        if status_proposals:
            summary_parts.append(f"状態変更の提案 {len(status_proposals)} 件")

        summary = "。".join(summary_parts) + "。"

        # ── 整合性チェック（29_Observer_Warnings.md）────────────────
        # warnings は { code, message, details? } のリスト。COUNT_MISMATCH / SUMMARY_MISMATCH
        warnings: list[dict[str, Any]] = []

        # (1) summary 先頭の件数と node_count の一致
        m = re.search(r"机の上に\s*(\d+)\s*件", summary)
        if m:
            summary_total = int(m.group(1))
            if summary_total != node_count:
                warnings.append({
                    "code": "SUMMARY_MISMATCH",
                    "message": "node_count と summary の件数が一致しません",
                    "details": {"node_count": node_count, "summary_total": summary_total},
                })

        # (2) status 別集計の合計と node_count の一致（COUNT_MISMATCH）
        by_status: dict[str, int] = {}
        for node in all_nodes:
            s = (node.get("status") or "UNKNOWN").strip() or "UNKNOWN"
            by_status[s] = by_status.get(s, 0) + 1
        status_sum = sum(by_status.values())
        if status_sum != node_count:
            warnings.append({
                "code": "COUNT_MISMATCH",
                "message": "node_count と status 集計の合計が一致しません",
                "details": {
                    "node_count": node_count,
                    "status_sum": status_sum,
                    "by_status": by_status,
                },
            })

        # ── 鮮度（31_Observer_Freshness.md）: payload.meta ──
        now_utc = datetime.now(timezone.utc)
        meta = {
            "observed_at": now_utc.isoformat(),
            "freshness_minutes": 0,  # 保存時点では 0。表示時に observed_at から再計算する想定。
        }

        # ── ObserverReport を返す (19 §4.2) ──
        return {
            "suggested_next": suggested_next,
            "status_proposals": status_proposals,
            "cooling_alerts": cooling_alerts,
            "summary": summary,
            "node_count": node_count,
            "warnings": warnings,
            "meta": meta,
        }


# ─── レポート保存 ──────────────────────────────────────────
# Phase 3-0: ObserverReport を POST /api/observer/reports に保存する。
# --save フラグを付けると保存する。なしなら stdout のみ。

def _save_report_headers() -> dict[str, str]:
    """Phase 3-1: Bearer token を付与。未設定時は空で送り 401 で失敗する。"""
    if not OBSERVER_TOKEN:
        return {}
    return {"Authorization": f"Bearer {OBSERVER_TOKEN}"}


async def save_report(
    client: httpx.AsyncClient,
    report: dict[str, Any],
    node_count: int,
) -> dict[str, Any]:
    """ObserverReport を POST /api/observer/reports に保存する。"""
    path = "/api/observer/reports"
    url = f"{BASE_URL.rstrip('/')}{path}"
    try:
        resp = await client.post(
            url,
            json={
                "payload": report,
                "generated_by": "observer_cli",
                "node_count": node_count,
            },
            headers=_save_report_headers(),
        )
    except httpx.ConnectError as e:
        msg = f"{_call_desc('POST', path)} 接続できません。NEXT_BASE_URL を確認してください。"
        raise RuntimeError(msg) from e
    _check_http_error(resp, "POST", path)
    data = resp.json()
    if not data.get("ok"):
        err = data.get("error", "unknown")
        raise RuntimeError(f"{_call_desc('POST', path)} — {err}")
    return data


async def fetch_latest_report(client: httpx.AsyncClient) -> dict[str, Any]:
    """GET /api/observer/reports/latest — Phase 3-2.1 本番スモーク用。Bearer で認証。"""
    path = "/api/observer/reports/latest"
    url = f"{BASE_URL.rstrip('/')}{path}"
    try:
        resp = await client.get(url, headers=_save_report_headers())
    except httpx.ConnectError as e:
        msg = f"{_call_desc('GET', path)} 接続できません。NEXT_BASE_URL を確認してください。"
        raise RuntimeError(msg) from e
    _check_http_error(resp, "GET", path)
    data = resp.json()
    if not data.get("ok"):
        raise RuntimeError(f"latest API error: {data.get('error')}")
    return data


# ─── エントリポイント ──────────────────────────────────────

async def main() -> None:
    should_save = "--save" in sys.argv
    strict_warnings = "--strict" in sys.argv

    async with httpx.AsyncClient(timeout=30.0) as client:
        # observe() の内部で client を使うため、ここで再実装せず
        # トップレベルの observe を呼ぶ（client は内部で生成される）
        pass

    report = await observe()

    # 常に stdout に出力
    print(json.dumps(report, ensure_ascii=False, indent=2))

    # --save フラグがあれば API に保存し、Phase 3-2.1 で latest と突き合わせて healthcheck
    if should_save:
        # 31: payload.meta が欠落していないか確認（本番で meta が届かない原因切り分け用）
        meta = report.get("meta") if isinstance(report.get("meta"), dict) else None
        if not (meta and meta.get("observed_at")):
            print(
                "warning: report has no payload.meta.observed_at; API may backfill (31_Observer_Freshness)",
                file=sys.stderr,
            )
        node_count = report.get("node_count")
        if node_count is None:
            node_count = (
                len(report.get("status_proposals", []))
                + len(report.get("cooling_alerts", []))
                + (1 if report.get("suggested_next") else 0)
            )
        async with httpx.AsyncClient(timeout=30.0) as client:
            result = await save_report(client, report, node_count)
            print(
                f"\n✓ Saved: report_id={result.get('report_id')} "
                f"created_at={result.get('created_at')}",
                file=sys.stderr,
            )
            # 本番スモーク: GET latest で report_id と summary が一致するか検証。失敗なら exit 1（Actions を赤にする）
            latest_data = await fetch_latest_report(client)
            report_latest = latest_data.get("report")
            saved_id = result.get("report_id")
            expected_summary = report.get("summary", "")
            payload_latest = (report_latest or {}).get("payload") or {}
            summary_latest = payload_latest.get("summary", "")
            if not report_latest:
                print("healthcheck failed: latest returned no report", file=sys.stderr)
                sys.exit(1)
            if report_latest.get("report_id") != saved_id:
                print(
                    f"healthcheck failed: report_id mismatch (saved={saved_id!r}, latest={report_latest.get('report_id')!r})",
                    file=sys.stderr,
                )
                sys.exit(1)
            if summary_latest != expected_summary:
                print(
                    f"healthcheck failed: summary mismatch (expected len={len(expected_summary)}, got len={len(summary_latest)})",
                    file=sys.stderr,
                )
                sys.exit(1)
            # Phase 3-4.5: latest の payload.warnings を確認。1 件以上なら stderr に出す。--strict なら exit(1)
            warnings_latest = payload_latest.get("warnings") or []
            if not isinstance(warnings_latest, list):
                warnings_latest = []
            if warnings_latest:
                print("⚠ Observer report has warnings:", file=sys.stderr)
                for i, w in enumerate(warnings_latest):
                    if isinstance(w, dict):
                        code = w.get("code", "?")
                        msg = w.get("message", "")
                        details = w.get("details")
                        print(f"  [{i+1}] {code}: {msg}", file=sys.stderr)
                        if details is not None:
                            print(f"      details: {json.dumps(details, ensure_ascii=False)}", file=sys.stderr)
                    else:
                        print(f"  [{i+1}] {w!r}", file=sys.stderr)
                if strict_warnings:
                    print("healthcheck failed: --strict and payload has warnings (exit 1)", file=sys.stderr)
                    sys.exit(1)
            # Phase 3-4.6: 本番運用テスト用の1行目印（Actions ログで合否判定しやすい）
            latest_id = report_latest.get("report_id", "")
            w_count = len(warnings_latest)
            nc = payload_latest.get("node_count")
            nc_str = str(nc) if nc is not None else "-"
            sn = payload_latest.get("suggested_next")
            rule_ver = "-"
            if isinstance(sn, dict) and isinstance(sn.get("debug"), dict):
                rule_ver = str(sn["debug"].get("rule_version", "-"))
            print(
                f"OP_TEST: saved={saved_id} latest={latest_id} warnings={w_count} node_count={nc_str} rule={rule_ver}",
                file=sys.stderr,
            )
            print("✓ healthcheck passed: report_id and summary match latest", file=sys.stderr)


if __name__ == "__main__":
    import asyncio

    try:
        asyncio.run(main())
    except Exception as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)
