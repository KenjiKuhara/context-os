/**
 * GET/POST /api/recurring/run — 定期ジョブ用。cron から Bearer CRON_SECRET で呼ぶ。
 * Vercel Cron は GET で呼ぶため GET も受け付ける。
 * service role で recurring_rules を走査し、条件を満たすルールごとに nodes に1件だけ挿入して next_run_at を更新する。
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
  const todayJST = getTodayJST();
  const endOfTodayJSTUTC = getEndOfTodayJSTUTC();
  const { data: rules, error: selectError } = await supabaseAdmin
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
    if (endAt && rule.next_run_at > endAt) continue;
    if (new Date(rule.next_run_at) < new Date(rule.start_at)) continue;

    const userId = rule.user_id as string;
    const title = rule.title as string;
    const dueDate = toDateOnly(rule.next_run_at as string);

    const { error: insertError } = await supabaseAdmin.from("nodes").insert({
      user_id: userId,
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
    const { error: updateError } = await supabaseAdmin
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

  return NextResponse.json({ ok: true, processed: results.length, results });
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
