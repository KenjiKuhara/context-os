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
import sys
from datetime import datetime, timezone
from typing import Any

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
OBSERVER_TOKEN = os.getenv("OBSERVER_TOKEN", "")
COOLING_THRESHOLD = int(os.getenv("COOLING_THRESHOLD", "40"))
COOLING_DAYS = int(os.getenv("COOLING_DAYS", "7"))


# ─── API クライアント ──────────────────────────────────────
# 25_Boundary §5.1: Python は Next.js Skill API を HTTP で呼ぶ。DB には触れない。

async def fetch_dashboard(client: httpx.AsyncClient) -> dict[str, Any]:
    """GET /api/dashboard — アクティブ Node 一覧を取得。"""
    resp = await client.get(f"{BASE_URL}/api/dashboard")
    resp.raise_for_status()
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
    resp = await client.post(
        f"{BASE_URL}/api/nodes/{node_id}/estimate-status",
        json={"intent": intent},
        # confirm_status を送らない = Preview mode
    )
    resp.raise_for_status()
    data = resp.json()
    if not data.get("ok"):
        raise RuntimeError(f"estimate-status Preview error: {data.get('error')}")
    return data


# ─── Node ヘルパー ─────────────────────────────────────────

def get_title(node: dict[str, Any]) -> str:
    return node.get("title") or node.get("name") or "(タイトルなし)"


def days_since_update(node: dict[str, Any]) -> int | None:
    updated = node.get("updated_at")
    if not updated:
        return None
    try:
        dt = datetime.fromisoformat(updated.replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - dt).days
    except (ValueError, TypeError):
        return None


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
            return {
                "suggested_next": None,
                "status_proposals": [],
                "cooling_alerts": [],
                "summary": "机の上にノードがありません。",
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
            days = days_since_update(node)
            updated = node.get("updated_at", "")

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
                    "last_updated": updated,
                    "message": f"「{title}」は{' / '.join(reason_parts)}。止めてよいですか？",
                })

        # ── Step 4: suggested_next を構成 ──
        # 00_Vision §4: 「今なにやる？」に 1 件だけ返す
        # 優先: IN_PROGRESS > NEEDS_DECISION > READY > その他
        # 同一 status 内では temperature 降順

        priority_order = [
            "IN_PROGRESS",
            "NEEDS_DECISION",
            "READY",
            "BLOCKED",
            "WAITING_EXTERNAL",
        ]

        suggested_next = None
        for target_status in priority_order:
            candidates = [
                n for n in all_nodes if n.get("status") == target_status
            ]
            if not candidates:
                continue
            # temperature 降順（高い = 最近意識されている）
            candidates.sort(
                key=lambda n: n.get("temperature") or 0, reverse=True
            )
            best = candidates[0]
            status = best.get("status", "")
            reason_map = {
                "IN_PROGRESS": "実施中で最も温度が高いノードです",
                "NEEDS_DECISION": "判断待ちのノードがあります",
                "READY": "着手可能な状態です",
                "BLOCKED": "障害がありますが、解消すれば進められます",
                "WAITING_EXTERNAL": "外部からの返答を確認してみてください",
            }
            suggested_next = {
                "node_id": best["id"],
                "title": get_title(best),
                "reason": reason_map.get(status, f"{status} のノードです"),
                "next_action": f"「{get_title(best)}」の context を確認し、次の一手を決める",
            }
            break

        # ── Step 5: summary 構成 ──
        tray_counts = {k: len(v) for k, v in trays.items()}
        total = sum(tray_counts.values())
        summary_parts = [f"机の上に {total} 件のノードがあります"]
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

        # ── ObserverReport を返す (19 §4.2) ──
        return {
            "suggested_next": suggested_next,
            "status_proposals": status_proposals,
            "cooling_alerts": cooling_alerts,
            "summary": summary,
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
    resp = await client.post(
        f"{BASE_URL}/api/observer/reports",
        json={
            "payload": report,
            "generated_by": "observer_cli",
            "node_count": node_count,
        },
        headers=_save_report_headers(),
    )
    resp.raise_for_status()
    data = resp.json()
    if not data.get("ok"):
        raise RuntimeError(f"save report error: {data.get('error')}")
    return data


async def fetch_latest_report(client: httpx.AsyncClient) -> dict[str, Any]:
    """GET /api/observer/reports/latest — Phase 3-2.1 本番スモーク用。"""
    resp = await client.get(f"{BASE_URL}/api/observer/reports/latest")
    resp.raise_for_status()
    data = resp.json()
    if not data.get("ok"):
        raise RuntimeError(f"latest API error: {data.get('error')}")
    return data


# ─── エントリポイント ──────────────────────────────────────

async def main() -> None:
    should_save = "--save" in sys.argv

    async with httpx.AsyncClient(timeout=30.0) as client:
        # observe() の内部で client を使うため、ここで再実装せず
        # トップレベルの observe を呼ぶ（client は内部で生成される）
        pass

    report = await observe()

    # 常に stdout に出力
    print(json.dumps(report, ensure_ascii=False, indent=2))

    # --save フラグがあれば API に保存し、Phase 3-2.1 で latest と突き合わせて healthcheck
    if should_save:
        all_count = (
            len(report.get("status_proposals", []))
            + len(report.get("cooling_alerts", []))
            + (1 if report.get("suggested_next") else 0)
        )
        async with httpx.AsyncClient(timeout=30.0) as client:
            result = await save_report(client, report, all_count)
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
            print("✓ healthcheck passed: report_id and summary match latest", file=sys.stderr)


if __name__ == "__main__":
    import asyncio

    asyncio.run(main())
