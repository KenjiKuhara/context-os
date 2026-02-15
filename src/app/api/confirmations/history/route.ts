/**
 * GET /api/confirmations/history
 *
 * Phase7-A: 適用済み Diff 履歴を取得する。読み取り専用。
 *
 * 77_phase7_history_design.md §4
 * 78_phase7_history_mvp_plan.md Step1
 *
 * - consumed = true の confirmation のみ
 * - proposed_change.type IN ('relation','grouping','decomposition')
 * - status_change は対象外
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAndUser } from "@/lib/supabase/server";

const DIFF_TYPES = ["relation", "grouping", "decomposition"] as const;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(s: string): boolean {
  return UUID_REGEX.test(s.trim());
}

/** node_id フィルタ: この Node に関係する履歴か */
function matchesNodeFilter(
  item: { node_id: string; proposed_change: Record<string, unknown> },
  nodeId: string
): boolean {
  if (item.node_id === nodeId) return true;
  const pc = item.proposed_change;
  if (!pc || typeof pc !== "object") return false;
  if (pc.from_node_id === nodeId || pc.to_node_id === nodeId) return true;
  if (pc.parent_node_id === nodeId) return true;
  const nodeIds = pc.node_ids;
  if (Array.isArray(nodeIds) && nodeIds.includes(nodeId)) return true;
  return false;
}

export async function GET(req: NextRequest) {
  const { supabase, user } = await getSupabaseAndUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(req.url);
    const typeParam = searchParams.get("type")?.trim();
    const nodeIdParam = searchParams.get("node_id")?.trim();
    const limitParam = searchParams.get("limit");
    const offsetParam = searchParams.get("offset");

    // node_id バリデーション（指定時は UUID 形式必須）
    if (nodeIdParam && !isValidUuid(nodeIdParam)) {
      return NextResponse.json(
        { ok: false, error: "node_id must be a valid UUID" },
        { status: 400 }
      );
    }

    // type バリデーション（指定時は relation / grouping / decomposition のいずれか）
    if (typeParam && !DIFF_TYPES.includes(typeParam as (typeof DIFF_TYPES)[number])) {
      return NextResponse.json(
        {
          ok: false,
          error: `type must be one of: ${DIFF_TYPES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // limit: デフォルト 50、最大 100
    let limit = 50;
    if (limitParam !== undefined && limitParam !== null) {
      const parsed = parseInt(limitParam, 10);
      if (!Number.isNaN(parsed) && parsed >= 1) {
        limit = Math.min(parsed, 100);
      }
    }

    // offset: デフォルト 0
    let offset = 0;
    if (offsetParam !== undefined && offsetParam !== null) {
      const parsed = parseInt(offsetParam, 10);
      if (!Number.isNaN(parsed) && parsed >= 0) {
        offset = parsed;
      }
    }

    // consumed = true のみ取得。ソートは consumed_at DESC NULLS LAST, confirmed_at DESC
    // フィルタをメモリで行うため、多めに取得してからフィルタ・スライス（MVP では 500 件まで取得）
    const fetchLimit = 500;
    const { data: rows, error } = await supabase
      .from("confirmation_events")
      .select("confirmation_id, node_id, confirmed_at, consumed_at, proposed_change, ui_action")
      .eq("consumed", true)
      .order("consumed_at", { ascending: false, nullsFirst: false })
      .order("confirmed_at", { ascending: false })
      .limit(fetchLimit);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    // proposed_change.type IN ('relation','grouping','decomposition') でフィルタ
    let items = (rows ?? []).filter((row) => {
      const pc = row.proposed_change;
      if (!pc || typeof pc !== "object") return false;
      const t = (pc as Record<string, unknown>).type;
      return typeof t === "string" && DIFF_TYPES.includes(t as (typeof DIFF_TYPES)[number]);
    });

    // type パラメータ指定時はさらに絞る
    if (typeParam) {
      items = items.filter(
        (row) => (row.proposed_change as Record<string, unknown>)?.type === typeParam
      );
    }

    // node_id パラメータ指定時はさらに絞る
    if (nodeIdParam) {
      items = items.filter((row) =>
        matchesNodeFilter(
          { node_id: row.node_id, proposed_change: row.proposed_change as Record<string, unknown> },
          nodeIdParam
        )
      );
    }

    // ページネーション: フィルタ後の results をスライス
    const sliced = items.slice(offset, offset + limit);

    return NextResponse.json({
      ok: true,
      items: sliced.map((row) => ({
        confirmation_id: row.confirmation_id,
        node_id: row.node_id,
        confirmed_at: row.confirmed_at,
        consumed_at: row.consumed_at,
        proposed_change: row.proposed_change,
        ui_action: row.ui_action,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
