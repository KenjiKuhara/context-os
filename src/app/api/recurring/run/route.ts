/**
 * GET/POST /api/recurring/run — 定期ジョブ用。cron から Bearer CRON_SECRET で呼ぶ。
 * Vercel Cron は GET で呼ぶため GET も受け付ける。
 * 条件を満たすルールごとに「今日分は1回だけ」を条件付き UPDATE で守り、更新できたときだけ nodes に1件挿入。
 * ジョブが動いたときは必ず run_history に1件（rule_id=NULL）残し、動いて更新しなかったかどうかを追えるようにする。
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { computeNextRunAt, getEndOfTodayJSTUTC, getTodayJST, toDateOnly, toJSTDate } from "@/lib/recurringRun";

function checkCronAuth(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  return !!secret && token === secret;
}

async function executeRun() {
  const nowIso = new Date().toISOString();
  const todayJST = getTodayJST();
  const endOfTodayJSTUTC = getEndOfTodayJSTUTC();

  const { data: rules, error: selectError } = await supabaseAdmin
    .from("recurring_rules")
    .select("id, user_id, title, schedule_type, time_of_day, start_at, end_at, next_run_at, is_active, last_run_at, last_run_for_date")
    .eq("is_active", true)
    .lte("next_run_at", endOfTodayJSTUTC)
    .or(`last_run_for_date.is.null,last_run_for_date.lt."${todayJST}"`);

  if (selectError) {
    return NextResponse.json({ ok: false, error: selectError.message }, { status: 500 });
  }

  const items = rules ?? [];
  const results: { id: string; created: boolean; error?: string }[] = [];
  let createdCount = 0;

  for (const rule of items) {
    if (toJSTDate(rule.next_run_at as string) > todayJST) continue;
    const endAt = rule.end_at ? new Date(rule.end_at).toISOString() : null;
    if (endAt && rule.next_run_at > endAt) continue;
    if (new Date(rule.next_run_at) < new Date(rule.start_at)) continue;

    const nextRunAt = computeNextRunAt(
      rule.next_run_at as string,
      rule.schedule_type as string,
      (rule.time_of_day as string) || "00:00"
    );
    const exceedsEnd = endAt != null && nextRunAt > endAt;

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("recurring_rules")
      .update({
        next_run_at: nextRunAt,
        last_run_at: nowIso,
        last_run_for_date: todayJST,
        is_active: !exceedsEnd,
        updated_at: nowIso,
      })
      .eq("id", rule.id)
      .or(`last_run_for_date.is.null,last_run_for_date.lt."${todayJST}"`)
      .select("id");

    if (updateError) {
      results.push({ id: rule.id, created: false, error: updateError.message });
      continue;
    }
    if (!updated || updated.length === 0) {
      continue;
    }

    const userId = rule.user_id as string;
    const title = rule.title as string;
    const dueDate = toDateOnly(rule.next_run_at as string);

    const { data: insertedNode, error: insertError } = await supabaseAdmin
      .from("nodes")
      .insert({
        user_id: userId,
        title,
        context: null,
        parent_id: null,
        sibling_order: 0,
        status: "CAPTURED",
        temperature: 50,
        tags: [],
        due_date: dueDate,
      })
      .select("id")
      .single();

    if (insertError) {
      results.push({ id: rule.id, created: true, error: insertError.message });
      continue;
    }

    createdCount += 1;
    await supabaseAdmin.from("run_history").insert({
      rule_id: rule.id,
      run_at: nowIso,
      run_for_date: todayJST,
      trigger: "cron",
      created_node_id: insertedNode?.id ?? null,
    });
    results.push({ id: rule.id, created: true });
  }

  await supabaseAdmin.from("run_history").insert({
    rule_id: null,
    run_at: nowIso,
    run_for_date: todayJST,
    trigger: "cron",
    created_node_id: null,
    processed_count: items.length,
    created_count: createdCount,
  });

  return NextResponse.json({ ok: true, processed: results.length, created: createdCount, results });
}

export async function GET(req: NextRequest) {
  if (!checkCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return executeRun();
}

export async function POST(req: NextRequest) {
  if (!checkCronAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return executeRun();
}
