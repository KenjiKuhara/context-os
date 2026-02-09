/**
 * GET /api/observer/reports/latest
 *
 * 最新の ObserverReport を 1 件返す。
 * ダッシュボードの「Observer 提案」パネルが呼び出す。
 * payload は DB に保存された JSON をそのまま返す（meta を含む。31_Observer_Freshness）。
 *
 * Based on:
 *   19_SubAgent_Observer.md §4.2 — ObserverReport 型
 *   19 §6 — 人間 UI との関係
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("observer_reports")
      .select("report_id, created_at, generated_by, payload, node_count, source, received_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      // レポートが 0 件の場合も error になる（PGRST116）
      if (error.code === "PGRST116") {
        return NextResponse.json({
          ok: true,
          report: null,
          message: "No observer reports yet",
        });
      }
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      report: data,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
