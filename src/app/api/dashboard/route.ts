/**
 * GET /api/dashboard
 *
 * 「机の上」にあるアクティブ Node をトレー別に返す。
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
    const { data, error } = await supabaseAdmin
      .from("nodes")
      .select("*")
      .in("status", [...ACTIVE_STATUSES])
      .order("updated_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    // トレー分け（status ベース）
    // 05_State_Machine.md のカテゴリに基づく
    const trays = {
      in_progress: [] as Record<string, unknown>[],
      needs_decision: [] as Record<string, unknown>[],
      waiting_external: [] as Record<string, unknown>[],
      cooling: [] as Record<string, unknown>[],
      other_active: [] as Record<string, unknown>[],
    };

    for (const n of data ?? []) {
      switch (n.status) {
        case "IN_PROGRESS":
          trays.in_progress.push(n);
          break;
        case "NEEDS_DECISION":
          trays.needs_decision.push(n);
          break;
        case "WAITING_EXTERNAL":
          trays.waiting_external.push(n);
          break;
        case "COOLING":
          trays.cooling.push(n);
          break;
        default:
          // CAPTURED, CLARIFYING, READY, DELEGATED, SCHEDULED,
          // BLOCKED, NEEDS_REVIEW, REACTIVATED
          trays.other_active.push(n);
          break;
      }
    }

    return NextResponse.json({ ok: true, trays });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
