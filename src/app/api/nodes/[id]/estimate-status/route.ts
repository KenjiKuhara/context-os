/**
 * POST /api/nodes/{id}/estimate-status
 *
 * status 変更の唯一のゲート（09_API_Contract.md §7）。
 *
 * Based on:
 *   09_API_Contract.md §7  — API 契約（estimate-status）
 *   05_State_Machine.md    — 遷移ルールの検証
 *   10_Architecture.md §3  — 状態の確定は App、AIは提案まで
 *   03_Non_Goals.md §2.2   — status を人に選ばせない
 *   00_Vision_NorthStar.md — 判断を奪わず、判断を支える
 *   17_Skill_EstimateStatus.md §6 — source / confirmation 拡張枠
 *   18_Skill_Governance.md §3 — source + confirmation の二層ガード
 *   23_Human_Confirmation_Model.md — Confirmation Object SSOT
 *
 * Two modes:
 *   Preview  (confirm_status absent): 推定候補を返す。DB への副作用なし。
 *   Apply    (confirm_status present): 遷移検証→適用→history 記録。
 *            status unchanged でも intent/reason を history に残す。
 *
 * Phase 2-γ:
 *   - confirmation_events テーブルが Confirmation SSOT（方式B）
 *   - ai_agent / mcp は confirmation_id 必須（無ければ 403）
 *   - human_ui も confirmation_events 経由で DB 検証（ルール統一）
 *   - Apply 成功時に confirmation_events.consumed=true に更新
 *   - consumed 済み / 失効済み / 不一致は拒否
 *   - source 省略時は後方互換（検証スキップ）
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import {
  type Status,
  isValidStatus,
  isValidTransition,
  getValidTransitions,
  estimateStatusFromIntent,
  STATUS_LABELS,
} from "@/lib/stateMachine";

// ─── source のバリデーションと禁止リスト ────────────────────
// 18_Skill_Governance.md §3.1 / §3.3

const VALID_SOURCES = [
  "human_ui",
  "ai_agent",
  "mcp",
  "batch",
  "skill_chain",
] as const;

type Source = (typeof VALID_SOURCES)[number];

const BLOCKED_SOURCES: readonly Source[] = ["batch", "skill_chain"];

/** confirmation_id が必須な source（Phase 2-γ） */
const CONFIRMATION_REQUIRED_SOURCES: readonly Source[] = [
  "human_ui",
  "ai_agent",
  "mcp",
];

function isValidSource(s: unknown): s is Source {
  return (
    typeof s === "string" &&
    (VALID_SOURCES as readonly string[]).includes(s)
  );
}

// ─── UUID 正規表現 ─────────────────────────────────────────

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── confirmation_events DB 検証 ────────────────────────────
// 23_Human_Confirmation_Model.md §4.2 / 24_SubAgent_Executor.md §5

interface ConfirmationRow {
  confirmation_id: string;
  node_id: string;
  confirmed_by: string;
  confirmed_at: string;
  ui_action: string;
  proposed_change: { type?: string; from?: string; to?: string };
  consumed: boolean;
  consumed_at: string | null;
  expires_at: string;
}

/**
 * confirmation_events テーブルを参照し、23 §4.2 の検証を実行する。
 * 成功時は ConfirmationRow を返す。失敗時は { error, httpStatus } を返す。
 */
async function validateConfirmationFromDB(
  confirmationId: string,
  nodeId: string,
  confirmStatus: string,
  currentStatus: string
): Promise<
  | { ok: true; row: ConfirmationRow }
  | { ok: false; error: string; httpStatus: number }
> {
  // Step 1: UUID 形式チェック
  if (!UUID_RE.test(confirmationId)) {
    return {
      ok: false,
      error: "confirmation_id must be a valid UUID",
      httpStatus: 400,
    };
  }

  // Step 2: DB から取得
  const { data, error } = await supabaseAdmin
    .from("confirmation_events")
    .select("*")
    .eq("confirmation_id", confirmationId)
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: `confirmation not found: ${confirmationId}`,
      httpStatus: 404,
    };
  }

  const row = data as ConfirmationRow;

  // Step 3: consumed チェック（1承認1Apply — 23 §4.1）
  if (row.consumed) {
    return {
      ok: false,
      error: `confirmation ${confirmationId} is already consumed (at ${row.consumed_at})`,
      httpStatus: 409,
    };
  }

  // Step 4: 失効チェック（23 §3.4）
  if (new Date(row.expires_at) <= new Date()) {
    return {
      ok: false,
      error: `confirmation ${confirmationId} has expired (expires_at: ${row.expires_at})`,
      httpStatus: 403,
    };
  }

  // Step 5: node_id 一致チェック
  if (row.node_id !== nodeId) {
    return {
      ok: false,
      error: `confirmation node_id ("${row.node_id}") does not match request node ("${nodeId}")`,
      httpStatus: 400,
    };
  }

  // Step 6: proposed_change の一致チェック
  if (row.proposed_change?.to !== confirmStatus) {
    return {
      ok: false,
      error: `confirmation proposed_change.to ("${row.proposed_change?.to}") does not match confirm_status ("${confirmStatus}")`,
      httpStatus: 400,
    };
  }
  if (row.proposed_change?.from !== currentStatus) {
    return {
      ok: false,
      error: `confirmation proposed_change.from ("${row.proposed_change?.from}") does not match current node status ("${currentStatus}"). Re-confirmation required.`,
      httpStatus: 409,
    };
  }

  return { ok: true, row };
}

/**
 * confirmation_events を consumed=true に更新する。
 */
async function consumeConfirmation(
  confirmationId: string
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabaseAdmin
    .from("confirmation_events")
    .update({
      consumed: true,
      consumed_at: new Date().toISOString(),
    })
    .eq("confirmation_id", confirmationId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ─── メインハンドラ ────────────────────────────────────────

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "invalid JSON" },
        { status: 400 }
      );
    }

    const intent =
      typeof body.intent === "string" ? body.intent.trim() : "";
    const confirmStatus = body.confirm_status; // string | undefined
    const reason =
      typeof body.reason === "string" ? body.reason.trim() : "";

    // ── source の受け取り ──
    const sourceRaw = body.source;
    const source: Source | null =
      sourceRaw !== undefined && sourceRaw !== null
        ? isValidSource(sourceRaw)
          ? (sourceRaw as Source)
          : null
        : null;

    if (
      sourceRaw !== undefined &&
      sourceRaw !== null &&
      !isValidSource(sourceRaw)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: `invalid source: "${sourceRaw}". Valid values: ${VALID_SOURCES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // ── confirmation_id の受け取り ──
    // Phase 2-γ: クライアントは confirmation_id だけ送る
    // 残りのフィールドは confirmation_events から DB 参照する
    const confirmationIdRaw =
      body.confirmation && typeof body.confirmation === "object"
        ? body.confirmation.confirmation_id
        : typeof body.confirmation_id === "string"
          ? body.confirmation_id
          : undefined;
    const confirmationId =
      typeof confirmationIdRaw === "string"
        ? confirmationIdRaw.trim()
        : null;

    // ──────────────────────────────────────────────
    // 1) 現在のノードを取得
    // ──────────────────────────────────────────────
    const { data: node, error: selErr } = await supabaseAdmin
      .from("nodes")
      .select("id, status, title, context, temperature")
      .eq("id", id)
      .single();

    if (selErr || !node) {
      return NextResponse.json(
        { ok: false, error: "node not found" },
        { status: 404 }
      );
    }

    const currentStatus = node.status as string;
    if (!isValidStatus(currentStatus)) {
      return NextResponse.json(
        {
          ok: false,
          error: `current status "${currentStatus}" is not recognised by State Machine`,
        },
        { status: 500 }
      );
    }

    // ──────────────────────────────────────────────
    // 2) Preview mode — confirm_status がない場合
    //    DB への副作用なし。候補を返すだけ。
    // ──────────────────────────────────────────────
    if (confirmStatus === undefined || confirmStatus === null) {
      const estimation = intent
        ? estimateStatusFromIntent(currentStatus, intent)
        : { suggested: null, reason: "入力がありません" };

      const candidates = getValidTransitions(currentStatus).map((s) => ({
        status: s,
        label: STATUS_LABELS[s],
      }));

      return NextResponse.json({
        ok: true,
        applied: false,
        current_status: currentStatus,
        current_label: STATUS_LABELS[currentStatus],
        suggested: estimation.suggested
          ? {
              status: estimation.suggested,
              label: STATUS_LABELS[estimation.suggested],
              reason: estimation.reason,
            }
          : null,
        candidates,
      });
    }

    // ──────────────────────────────────────────────
    // 3) Apply mode — confirm_status がある場合
    // ──────────────────────────────────────────────

    // ── source ガード（18 §3.3）──
    if (source && (BLOCKED_SOURCES as readonly string[]).includes(source)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Apply from source "${source}" is forbidden (18_Skill_Governance §3.3)`,
        },
        { status: 403 }
      );
    }

    // ── Phase 2-γ: confirmation 必須化 + DB 検証 ──
    // source が明示されている場合（human_ui / ai_agent / mcp）は
    // confirmation_id 必須。DB の confirmation_events を参照して検証する。
    // source 省略時は後方互換（検証スキップ）。
    let confirmedRow: ConfirmationRow | null = null;

    if (
      source &&
      (CONFIRMATION_REQUIRED_SOURCES as readonly string[]).includes(source)
    ) {
      if (!confirmationId) {
        return NextResponse.json(
          {
            ok: false,
            error: `source="${source}" requires confirmation_id (23_Human_Confirmation_Model §2, 18_Skill_Governance §3)`,
          },
          { status: 403 }
        );
      }

      const validation = await validateConfirmationFromDB(
        confirmationId,
        id,
        confirmStatus as string,
        currentStatus
      );

      if (!validation.ok) {
        return NextResponse.json(
          { ok: false, error: validation.error },
          { status: validation.httpStatus }
        );
      }

      confirmedRow = validation.row;
    }

    // ── status バリデーション ──
    if (!isValidStatus(confirmStatus)) {
      return NextResponse.json(
        { ok: false, error: `"${confirmStatus}" is not a valid status` },
        { status: 400 }
      );
    }

    const toStatus = confirmStatus as Status;
    const statusChanged = currentStatus !== toStatus;

    // ── 遷移ルールの検証 (05_State_Machine.md §3) ──
    if (statusChanged && !isValidTransition(currentStatus, toStatus)) {
      return NextResponse.json(
        {
          ok: false,
          error: `transition from ${currentStatus} to ${toStatus} is not allowed`,
          valid_transitions: getValidTransitions(currentStatus).map(
            (s) => ({
              status: s,
              label: STATUS_LABELS[s],
            })
          ),
        },
        { status: 422 }
      );
    }

    // ── Node の status を更新（変更がある場合のみ）──
    if (statusChanged) {
      const { error: updErr } = await supabaseAdmin
        .from("nodes")
        .update({ status: toStatus })
        .eq("id", id);

      if (updErr) {
        return NextResponse.json(
          { ok: false, error: updErr.message },
          { status: 500 }
        );
      }
    }

    // ── confirmation を消費する（Apply 成功時のみ）──
    // 23 §3.3 / 24 §6.1: Apply 成功時（status_changed true/false 問わず）に consumed=true
    if (confirmedRow) {
      const consumeResult = await consumeConfirmation(
        confirmedRow.confirmation_id
      );
      if (!consumeResult.ok) {
        // Node 更新は成功している可能性がある。warning 扱い。
        // consumed の更新失敗は致命的ではないが記録する。
        console.error(
          `[estimate-status] consume failed: ${consumeResult.error}`
        );
      }
    }

    // ── 履歴を必ず記録する ──
    const historyReason =
      reason ||
      intent ||
      (statusChanged
        ? "status changed"
        : "event recorded (no status change)");

    const now = new Date().toISOString();
    const historyRecord: Record<string, unknown> = {
      node_id: id,
      from_status: currentStatus,
      to_status: toStatus,
      reason: historyReason,
      // 監査フィールド
      source: source ?? null,
      confirmation_id: confirmedRow?.confirmation_id ?? confirmationId ?? null,
      confirmed_by: confirmedRow?.confirmed_by ?? null,
      confirmed_at: confirmedRow?.confirmed_at ?? null,
      ui_action: confirmedRow?.ui_action ?? null,
      proposed_change: confirmedRow?.proposed_change ?? null,
      consumed: true,
      consumed_at: now,
    };

    const { error: histErr } = await supabaseAdmin
      .from("node_status_history")
      .insert(historyRecord);

    if (histErr) {
      return NextResponse.json({
        ok: true,
        applied: true,
        from_status: currentStatus,
        to_status: toStatus,
        status_changed: statusChanged,
        reason: historyReason,
        source: source ?? "human_ui",
        confirmation_id: confirmedRow?.confirmation_id ?? null,
        warning: "history insert failed: " + histErr.message,
      });
    }

    // 親が完了 or 中止の場合、子孫ノードを同様に更新し、各子に「親が完了/中止になったため」のメモを残す
    if ((toStatus === "DONE" || toStatus === "CANCELLED") && statusChanged) {
      const cascadeReason =
        toStatus === "DONE"
          ? "親が完了になったため"
          : "親が中止になったため";
      const { data: childRows } = await supabaseAdmin
        .from("node_children")
        .select("parent_id, child_id");
      const parentToChildren = new Map<string, string[]>();
      for (const row of childRows ?? []) {
        const p = (row as { parent_id?: string }).parent_id;
        const c = (row as { child_id?: string }).child_id;
        if (p && c) {
          const list = parentToChildren.get(p) ?? [];
          list.push(c);
          parentToChildren.set(p, list);
        }
      }
      const descendantIds = new Set<string>();
      const queue = [id];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        const children = parentToChildren.get(cur) ?? [];
        for (const childId of children) {
          if (!descendantIds.has(childId)) {
            descendantIds.add(childId);
            queue.push(childId);
          }
        }
      }
      const nowCascade = new Date().toISOString();
      for (const childId of descendantIds) {
        const { data: childNode } = await supabaseAdmin
          .from("nodes")
          .select("id, status")
          .eq("id", childId)
          .single();
        if (!childNode) continue;
        const childFrom = (childNode.status as string) ?? "";
        if (childFrom === toStatus) continue;
        await supabaseAdmin
          .from("nodes")
          .update({ status: toStatus })
          .eq("id", childId);
        await supabaseAdmin.from("node_status_history").insert({
          node_id: childId,
          from_status: childFrom,
          to_status: toStatus,
          reason: cascadeReason,
          source: "cascade",
          confirmation_id: null,
          confirmed_by: null,
          confirmed_at: null,
          ui_action: null,
          proposed_change: null,
          consumed: true,
          consumed_at: nowCascade,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      applied: true,
      from_status: currentStatus,
      to_status: toStatus,
      status_changed: statusChanged,
      reason: historyReason,
      source: source ?? "human_ui",
      confirmation_id: confirmedRow?.confirmation_id ?? null,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
