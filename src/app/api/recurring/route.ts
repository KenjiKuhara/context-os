/**
 * GET /api/recurring — 自分の recurring_rules 一覧
 * POST /api/recurring — ルール作成（title, schedule_type, time_of_day, start_at, end_at 任意）
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAndUser } from "@/lib/supabase/server";

const SCHEDULE_TYPES = ["daily", "weekly", "monthly"] as const;
const TIME_OF_DAY_RE = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

function parseTimeOfDay(s: string): { hours: number; minutes: number } | null {
  if (!TIME_OF_DAY_RE.test(s)) return null;
  const [h, m] = s.split(":").map(Number);
  return { hours: h, minutes: m };
}

/** start_at の日付 + time_of_day で next_run_at を初期化（UTC） */
function initialNextRunAt(startAtIso: string, timeOfDay: string): string | null {
  const parsed = parseTimeOfDay(timeOfDay);
  if (!parsed) return null;
  const d = new Date(startAtIso);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCHours(parsed.hours, parsed.minutes, 0, 0);
  return d.toISOString();
}

export async function GET() {
  const { supabase, user } = await getSupabaseAndUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { data, error } = await supabase
      .from("recurring_rules")
      .select("id, user_id, title, schedule_type, time_of_day, start_at, end_at, next_run_at, is_active, created_at, updated_at")
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, items: data ?? [] });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { supabase, user } = await getSupabaseAndUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const schedule_type = typeof body.schedule_type === "string" ? body.schedule_type.trim().toLowerCase() : "";
    const time_of_day = (typeof body.time_of_day === "string" ? body.time_of_day.trim() : "") || "00:00";
    const start_atRaw = body.start_at;
    const end_atRaw = body.end_at;

    if (!title) {
      return NextResponse.json({ ok: false, error: "title is required" }, { status: 400 });
    }
    if (!SCHEDULE_TYPES.includes(schedule_type as (typeof SCHEDULE_TYPES)[number])) {
      return NextResponse.json(
        { ok: false, error: "schedule_type must be daily, weekly, or monthly" },
        { status: 400 }
      );
    }
    if (!parseTimeOfDay(time_of_day)) {
      return NextResponse.json(
        { ok: false, error: "time_of_day must be HH:MM (e.g. 08:00)" },
        { status: 400 }
      );
    }

    const start_at = start_atRaw != null ? new Date(start_atRaw).toISOString() : null;
    if (!start_at || Number.isNaN(new Date(start_atRaw).getTime())) {
      return NextResponse.json({ ok: false, error: "start_at is required and must be a valid date" }, { status: 400 });
    }

    const next_run_at = initialNextRunAt(start_at, time_of_day);
    if (!next_run_at) {
      return NextResponse.json({ ok: false, error: "invalid start_at or time_of_day" }, { status: 400 });
    }

    let end_at: string | null = null;
    if (end_atRaw != null && end_atRaw !== "") {
      const endDate = new Date(end_atRaw);
      if (!Number.isNaN(endDate.getTime())) end_at = endDate.toISOString();
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("recurring_rules")
      .insert({
        user_id: user.id,
        title,
        schedule_type,
        time_of_day,
        start_at,
        end_at,
        next_run_at,
        is_active: true,
        updated_at: now,
      })
      .select("id, user_id, title, schedule_type, time_of_day, start_at, end_at, next_run_at, is_active, created_at, updated_at")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, data });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
