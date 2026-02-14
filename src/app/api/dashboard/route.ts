/**
 * GET /api/dashboard
 *
 * 「机の上」にあるアクティブ Node をトレー別に返す。
 * Phase6-A: ツリー表示用に node_children（parent_id, child_id, created_at）を追加。
 *
 * Based on:
 *   09_API_Contract.md §9 — GET /dashboard/active
 *   05_State_Machine.md   — 状態定義（15種）
 *   00_Vision_NorthStar.md §4 — 「今なにやる？」の材料
 *
 * Note: 09 契約は /dashboard/active と /dashboard/cooling を分離しているが、
 * MVP では 1 本で active 全体（cooling 含む）を返す。
 * 将来分割する場合もこの構造から自然に切り出せる。
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { ACTIVE_STATUSES } from "@/lib/stateMachine";

export async function GET() {
  try {
    // ACTIVE_STATUSES は stateMachine.ts で一元管理
    // DONE / CANCELLED / DORMANT を除いた12状態
    const [nodesRes, childrenRes] = await Promise.all([
      supabaseAdmin
        .from("nodes")
        .select("*")
        .in("status", [...ACTIVE_STATUSES])
        .order("updated_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("node_children")
        .select("parent_id, child_id, created_at"),
    ]);

    const { data: nodeData, error } = nodesRes;
    if (error) throw error;

    const nodeIds = (nodeData ?? []).map((n) => n.id as string);
    let lastMemoByNodeId: Record<string, string> = {};
    let lastMemoAtByNodeId: Record<string, string> = {};
    if (nodeIds.length > 0) {
      const { data: historyRows } = await supabaseAdmin
        .from("node_status_history")
        .select("node_id, reason, consumed_at")
        .in("node_id", nodeIds)
        .order("consumed_at", { ascending: false, nullsFirst: false })
        .limit(500);
      const seen = new Set<string>();
      for (const row of historyRows ?? []) {
        const id = row.node_id as string;
        if (seen.has(id)) continue;
        const reason = typeof row.reason === "string" ? row.reason.trim() : "";
        if (reason) {
          seen.add(id);
          lastMemoByNodeId[id] = reason;
          const at = row.consumed_at;
          lastMemoAtByNodeId[id] = typeof at === "string" ? at : "";
        }
      }
    }

    // node_children は存在しないテーブルの場合があるためエラーを無視（Phase5-C 未適用環境）
    const nodeChildren =
      childrenRes.error == null && Array.isArray(childrenRes.data)
        ? childrenRes.data.map((r) => ({
            parent_id: r.parent_id as string,
            child_id: r.child_id as string,
            created_at: r.created_at as string,
          }))
        : [];

    // トレー分け（status ベース）
    // 05_State_Machine.md のカテゴリに基づく
    const trays = {
      in_progress: [] as Record<string, unknown>[],
      needs_decision: [] as Record<string, unknown>[],
      waiting_external: [] as Record<string, unknown>[],
      cooling: [] as Record<string, unknown>[],
      other_active: [] as Record<string, unknown>[],
    };

    for (const n of nodeData ?? []) {
      const nodeWithMemo = {
        ...n,
        last_memo: lastMemoByNodeId[n.id as string] ?? null,
        last_memo_at: lastMemoAtByNodeId[n.id as string] ?? null,
      };
      switch (n.status) {
        case "IN_PROGRESS":
          trays.in_progress.push(nodeWithMemo);
          break;
        case "NEEDS_DECISION":
          trays.needs_decision.push(nodeWithMemo);
          break;
        case "WAITING_EXTERNAL":
          trays.waiting_external.push(nodeWithMemo);
          break;
        case "COOLING":
          trays.cooling.push(nodeWithMemo);
          break;
        default:
          trays.other_active.push(nodeWithMemo);
          break;
      }
    }

    return NextResponse.json({
      ok: true,
      trays,
      node_children: nodeChildren,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
