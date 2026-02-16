/**
 * GET /api/observer/reports/latest
 *
 * 最新の ObserverReport を 1 件返す。
 * 認証: Bearer OBSERVER_TOKEN（CI/本番スモーク用）またはセッション（ダッシュボード用）。
 *
 * Based on:
 *   19_SubAgent_Observer.md §4.2 — ObserverReport 型
 *   19 §6 — 人間 UI との関係
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAndUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearerToken } from "../route";

async function fetchLatestReport(supabase: { from: (table: string) => ReturnType<typeof supabaseAdmin.from> }) {
  const { data, error } = await supabase
    .from("observer_reports")
    .select("report_id, created_at, generated_by, payload, node_count, source, received_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error) {
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
  return NextResponse.json({ ok: true, report: data });
}

export async function GET(req: NextRequest) {
  const token = getBearerToken(req);
  const expectedToken = process.env.OBSERVER_TOKEN;
  const bearerValid =
    !!token &&
    !!expectedToken &&
    expectedToken.length >= 16 &&
    token === expectedToken;

  if (bearerValid) {
    try {
      return await fetchLatestReport(supabaseAdmin);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "unknown error";
      return NextResponse.json(
        { ok: false, error: message },
        { status: 500 }
      );
    }
  }

  const { supabase, user } = await getSupabaseAndUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return await fetchLatestReport(supabase);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
