/**
 * @deprecated — この API は非推奨です。
 *
 * status 変更の正式なゲートは POST /api/nodes/{id}/estimate-status です。
 * estimate-status は State Machine に基づく遷移検証と、必ず history を記録する
 * 機能を含みます。
 *
 * この旧 API は以下の問題を持ちます：
 *   - 遷移ルールの検証なし（05_State_Machine.md §3 に違反し得る）
 *   - 15 状態のうち 4 状態が定義されていない（DELEGATED, SCHEDULED, DORMANT, CANCELLED）
 *   - status を人が直接指定する設計（03_Non_Goals.md §2.2 に反する）
 *
 * 参照:
 *   09_API_Contract.md §5「非推奨：PATCH /nodes/{id}/status」
 *   03_Non_Goals.md §2.2「状態（status）を人に選ばせない」
 *
 * MCP 等の外部参照がないことを確認のうえ廃止予定。
 * 新規の実装・ツール・エージェントからこの API を呼ばないでください。
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

type Status =
  | "CAPTURED"
  | "IN_PROGRESS"
  | "NEEDS_DECISION"
  | "WAITING_EXTERNAL"
  | "COOLING"
  | "DONE"
  | "BLOCKED"
  | "NEEDS_REVIEW"
  | "READY"
  | "CLARIFYING"
  | "REACTIVATED";

const ALLOWED_STATUSES: Status[] = [
  "CAPTURED",
  "IN_PROGRESS",
  "NEEDS_DECISION",
  "WAITING_EXTERNAL",
  "COOLING",
  "DONE",
  "BLOCKED",
  "NEEDS_REVIEW",
  "READY",
  "CLARIFYING",
  "REACTIVATED",
];

function isValidStatus(s: unknown): s is Status {
  return typeof s === "string" && (ALLOWED_STATUSES as string[]).includes(s);
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    // JSONの読み取り（NextRequest.json()はUTF-8前提でOK）
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "invalid JSON" },
        { status: 400 }
      );
    }

    const statusFromBody = (body as { status?: unknown }).status;
    const noteRaw = (body as { note?: unknown }).note;

    const note =
      typeof noteRaw === "string" && noteRaw.trim().length > 0
        ? noteRaw.trim()
        : null;

    // 1) 現在のnodeを取得（status が省略された場合はここで取った値を使う）
    const { data: currentNode, error: selErr } = await supabaseAdmin
      .from("nodes")
      .select("id,status")
      .eq("id", id)
      .single();

    if (selErr || !currentNode) {
      return NextResponse.json(
        { ok: false, error: "node not found" },
        { status: 404 }
      );
    }

    const fromStatus = currentNode.status as Status;

    // status が送られていれば検証。省略時は現状維持（メモだけ更新）
    if (statusFromBody !== undefined && statusFromBody !== null && !isValidStatus(statusFromBody)) {
      return NextResponse.json(
        { ok: false, error: "status is invalid" },
        { status: 400 }
      );
    }
    const toStatus: Status =
      statusFromBody !== undefined && isValidStatus(statusFromBody)
        ? (statusFromBody as Status)
        : fromStatus;

    const statusChanged = fromStatus !== toStatus;

    // 2) nodes を更新（status 変更時は status、note あり時は note も）
    const nodeUpdate: { status?: Status; note?: string | null } = {};
    if (statusChanged) nodeUpdate.status = toStatus;
    if (note !== null) nodeUpdate.note = note;

    if (Object.keys(nodeUpdate).length > 0) {
      const { error: updErr } = await supabaseAdmin
        .from("nodes")
        .update(nodeUpdate)
        .eq("id", id);

      if (updErr) {
        return NextResponse.json(
          { ok: false, error: updErr.message },
          { status: 500 }
        );
      }
    }

    // 3) 履歴を書く条件
    // - statusが変わった → 書く
    // - statusが変わらないが note がある → 書く（これが今回の追加）
    const shouldWriteHistory = statusChanged || !!note;

    if (shouldWriteHistory) {
      // note は reason に入れる（noteカラムは使わない）
      const reason = note ?? (statusChanged ? "status changed" : "memo");

      const { error: histErr } = await supabaseAdmin
        .from("node_status_history")
        .insert({
          node_id: id,
          from_status: fromStatus,
          to_status: toStatus,
          reason,
        });

      if (histErr) {
        // nodes更新は成功している可能性があるのでwarningにする
        const payload: any = {
          ok: true,
          data: { id, status: toStatus },
          warning: "history insert failed",
          history_error: histErr.message,
        };
        if (!statusChanged) payload.message = "status unchanged (memo attempted)";
        return NextResponse.json(payload, { status: 200 });
      }
    }

    // 4) 応答
    if (!statusChanged && !note) {
      return NextResponse.json(
        { ok: true, data: { id, status: toStatus }, message: "status unchanged" },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        data: { id, status: toStatus },
        message: statusChanged ? "status updated" : "memo saved",
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unknown error" },
      { status: 500 }
    );
  }
}
