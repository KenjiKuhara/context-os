/**
 * POST /api/recurring/[id]/clear — 対象ルールの実行履歴をクリア（last_run_at / last_run_for_date を NULL にし、next_run_at を「今日」に戻す。run_history に clear を記録）
 * next_run_at を今日に戻すことで、クリア直後の「今すぐ実行」でタスクが 1 件生成されるようになる。
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAndUser } from "@/lib/supabase/server";
import { getTodayJST, getTodayJSTAtUTC } from "@/lib/recurringRun";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await getSupabaseAndUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id?.trim()) {
    return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
  }

  const { data: rule, error: fetchError } = await supabase
    .from("recurring_rules")
    .select("id, time_of_day")
    .eq("id", id.trim())
    .single();

  if (fetchError || !rule) {
    return NextResponse.json({ ok: false, error: "Rule not found" }, { status: 404 });
  }

  const nowIso = new Date().toISOString();
  const todayJST = getTodayJST();
  const nextRunAt = getTodayJSTAtUTC(todayJST, (rule.time_of_day as string) || "00:00");

  const { error: updateError } = await supabase
    .from("recurring_rules")
    .update({
      last_run_at: null,
      last_run_for_date: null,
      next_run_at: nextRunAt,
      updated_at: nowIso,
    })
    .eq("id", id.trim());

  if (updateError) {
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  const { error: insertError } = await supabase.from("run_history").insert({
    rule_id: id.trim(),
    run_at: nowIso,
    run_for_date: null,
    trigger: "clear",
    created_node_id: null,
  });

  if (insertError) {
    return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
