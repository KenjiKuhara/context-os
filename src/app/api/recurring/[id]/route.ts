/**
 * PATCH /api/recurring/[id] — ルールの任意項目を更新
 * DELETE /api/recurring/[id] — 1件削除
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await getSupabaseAndUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    if (!id?.trim()) {
      return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (typeof body.title === "string") {
      const t = body.title.trim();
      if (!t) return NextResponse.json({ ok: false, error: "title must not be empty" }, { status: 400 });
      update.title = t;
    }
    if (typeof body.schedule_type === "string") {
      const s = body.schedule_type.trim().toLowerCase();
      if (!SCHEDULE_TYPES.includes(s as (typeof SCHEDULE_TYPES)[number])) {
        return NextResponse.json({ ok: false, error: "schedule_type must be daily, weekly, or monthly" }, { status: 400 });
      }
      update.schedule_type = s;
    }
    if (typeof body.time_of_day === "string") {
      const t = body.time_of_day.trim();
      if (!parseTimeOfDay(t)) {
        return NextResponse.json({ ok: false, error: "time_of_day must be HH:MM" }, { status: 400 });
      }
      update.time_of_day = t;
    }
    if (body.start_at !== undefined) {
      if (body.start_at == null || body.start_at === "") {
        return NextResponse.json({ ok: false, error: "start_at is required" }, { status: 400 });
      }
      const d = new Date(body.start_at);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ ok: false, error: "start_at must be a valid date" }, { status: 400 });
      }
      update.start_at = d.toISOString();
    }
    if (body.end_at !== undefined) {
      if (body.end_at == null || body.end_at === "") {
        update.end_at = null;
      } else {
        const d = new Date(body.end_at);
        if (Number.isNaN(d.getTime())) {
          return NextResponse.json({ ok: false, error: "end_at must be a valid date or null" }, { status: 400 });
        }
        update.end_at = d.toISOString();
      }
    }
    if (typeof body.is_active === "boolean") {
      update.is_active = body.is_active;
    }

    const { data, error } = await supabase
      .from("recurring_rules")
      .update(update)
      .eq("id", id.trim())
      .select("id, user_id, title, schedule_type, time_of_day, start_at, end_at, next_run_at, is_active, created_at, updated_at")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, data });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await getSupabaseAndUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await params;
    if (!id?.trim()) {
      return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
    }

    const { error } = await supabase.from("recurring_rules").delete().eq("id", id.trim());

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
