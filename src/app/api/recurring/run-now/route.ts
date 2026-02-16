/**
 * POST /api/recurring/run-now — ログイン中のユーザーが「今すぐ実行」で自分のルールだけ処理する。
 * RLS で自分の recurring_rules のみ取得し、条件を満たすものについて nodes に1件ずつ挿入して next_run_at を更新する。
 */

import { NextResponse } from "next/server";
import { getSupabaseAndUser } from "@/lib/supabase/server";
import { computeNextRunAt, getEndOfTodayJSTUTC, getTodayJST, toDateOnly, toJSTDate } from "@/lib/recurringRun";

export async function POST() {
  const { supabase, user } = await getSupabaseAndUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const todayJST = getTodayJST();
  const endOfTodayJSTUTC = getEndOfTodayJSTUTC();
  const { data: rules, error: selectError } = await supabase
    .from("recurring_rules")
    .select("id, user_id, title, schedule_type, time_of_day, start_at, end_at, next_run_at, is_active")
    .eq("is_active", true)
    .lte("next_run_at", endOfTodayJSTUTC);

  if (selectError) {
    return NextResponse.json({ ok: false, error: selectError.message }, { status: 500 });
  }

  const items = rules ?? [];
  const results: { id: string; created: boolean; error?: string }[] = [];

  for (const rule of items) {
    if (toJSTDate(rule.next_run_at as string) > todayJST) continue;
    const endAt = rule.end_at ? new Date(rule.end_at).toISOString() : null;
    if (endAt && (rule.next_run_at as string) > endAt) continue;
    if (new Date(rule.next_run_at as string) < new Date(rule.start_at as string)) continue;

    const title = rule.title as string;
    const dueDate = toDateOnly(rule.next_run_at as string);

    const { error: insertError } = await supabase.from("nodes").insert({
      user_id: user.id,
      title,
      context: null,
      parent_id: null,
      sibling_order: 0,
      status: "CAPTURED",
      temperature: 50,
      tags: [],
      due_date: dueDate,
    });

    if (insertError) {
      results.push({ id: rule.id, created: false, error: insertError.message });
      continue;
    }

    const nextRunAt = computeNextRunAt(
      rule.next_run_at as string,
      rule.schedule_type as string,
      (rule.time_of_day as string) || "00:00"
    );
    const exceedsEnd = endAt != null && nextRunAt > endAt;
    const { error: updateError } = await supabase
      .from("recurring_rules")
      .update({
        next_run_at: nextRunAt,
        is_active: !exceedsEnd,
        updated_at: new Date().toISOString(),
      })
      .eq("id", rule.id);

    if (updateError) {
      results.push({ id: rule.id, created: true, error: updateError.message });
    } else {
      results.push({ id: rule.id, created: true });
    }
  }

  const createdCount = results.filter((r) => r.created && !r.error).length;
  return NextResponse.json({ ok: true, processed: results.length, created: createdCount, results });
}
