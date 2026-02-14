/**
 * GET /api/nodes/{id}/history
 *
 * 指定ノードの node_status_history を新しい順で返す。
 * ステータス更新・メモのログ表示用。
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id?.trim()) {
      return NextResponse.json(
        { ok: false, error: "node id is required" },
        { status: 400 }
      );
    }

    const { data: rows, error } = await supabaseAdmin
      .from("node_status_history")
      .select("from_status, to_status, reason, consumed_at")
      .eq("node_id", id.trim())
      .order("consumed_at", { ascending: false, nullsFirst: false })
      .limit(100);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      items: (rows ?? []).map((r) => ({
        from_status: r.from_status,
        to_status: r.to_status,
        reason: r.reason ?? "",
        consumed_at: r.consumed_at ?? null,
      })),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
