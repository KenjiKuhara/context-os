/**
 * GET /api/recurring/history — 自分のルールの実行履歴とジョブ実行（rule_id NULL）を取得。
 * RLS で自分の rule に紐づく行と rule_id が NULL の行のみ返す。
 */

import { NextResponse } from "next/server";
import { getSupabaseAndUser } from "@/lib/supabase/server";

export async function GET() {
  const { supabase, user } = await getSupabaseAndUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("run_history")
    .select("id, rule_id, run_at, run_for_date, trigger, created_node_id, processed_count, created_count")
    .order("run_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, items: data ?? [] });
}
