/**
 * PATCH /api/nodes/:id
 *
 * タスクの title / due_date を更新。変更時のみ node_status_history に履歴を残す。
 * Body: title と due_date のどちらかまたは両方。少なくともどちらか必須。
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAndUser } from "@/lib/supabase/server";

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateString(s: string): boolean {
  if (!DATE_ONLY_RE.test(s)) return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function dueDateToDisplay(v: string | null | undefined): string {
  if (v == null || v === "") return "未設定";
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return "未設定";
  return s.replace(/-/g, "/");
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { supabase, user } = await getSupabaseAndUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await context.params;
    if (!id?.trim()) {
      return NextResponse.json(
        { ok: false, error: "node id is required" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "invalid JSON" },
        { status: 400 }
      );
    }

    const hasTitle = "title" in body;
    const hasDueDate = "due_date" in body;
    if (!hasTitle && !hasDueDate) {
      return NextResponse.json(
        { ok: false, error: "title or due_date is required" },
        { status: 400 }
      );
    }

    const logChange = (body as { logChange?: unknown }).logChange !== false;

    let newTitle: string | undefined;
    if (hasTitle) {
      const titleRaw = (body as { title?: unknown }).title;
      if (titleRaw === undefined || titleRaw === null) {
        return NextResponse.json(
          { ok: false, error: "title must not be empty when provided" },
          { status: 400 }
        );
      }
      const t = typeof titleRaw === "string" ? titleRaw.trim() : "";
      if (t === "") {
        return NextResponse.json(
          { ok: false, error: "title must not be empty" },
          { status: 400 }
        );
      }
      newTitle = t;
    }

    let newDueDate: string | null | undefined;
    if (hasDueDate) {
      const dueRaw = (body as { due_date?: unknown }).due_date;
      if (dueRaw === null || dueRaw === undefined) {
        newDueDate = null;
      } else if (typeof dueRaw === "string") {
        const s = dueRaw.trim();
        if (!s) newDueDate = null;
        else if (!isValidDateString(s)) {
          return NextResponse.json(
            { ok: false, error: "due_date must be YYYY-MM-DD or null" },
            { status: 400 }
          );
        } else {
          newDueDate = s;
        }
      } else {
        return NextResponse.json(
          { ok: false, error: "due_date must be string or null" },
          { status: 400 }
        );
      }
    }

    const { data: currentNode, error: selErr } = await supabase
      .from("nodes")
      .select("id, title, status, updated_at, due_date")
      .eq("id", id.trim())
      .single();

    if (selErr || !currentNode) {
      return NextResponse.json(
        { ok: false, error: "node not found" },
        { status: 404 }
      );
    }

    const currentTitle = typeof currentNode.title === "string" ? currentNode.title.trim() : "";
    const currentDueDate = currentNode.due_date ?? null;
    const currentDueNorm = currentDueDate == null || currentDueDate === "" ? null : String(currentDueDate).slice(0, 10);
    const newDueNorm = newDueDate === undefined ? undefined : (newDueDate === null || newDueDate === "" ? null : newDueDate.slice(0, 10));

    const titleChanged = hasTitle && newTitle !== undefined && currentTitle !== newTitle;
    const dueDateChanged = hasDueDate && newDueNorm !== undefined && currentDueNorm !== newDueNorm;

    if (!titleChanged && !dueDateChanged) {
      return NextResponse.json({ ok: true, unchanged: true });
    }

    const now = new Date().toISOString();
    const update: Record<string, unknown> = { updated_at: now };
    if (titleChanged && newTitle !== undefined) update.title = newTitle;
    if (dueDateChanged && newDueNorm !== undefined) update.due_date = newDueNorm;

    const { error: updErr } = await supabase
      .from("nodes")
      .update(update)
      .eq("id", id.trim());

    if (updErr) {
      return NextResponse.json(
        { ok: false, error: updErr.message },
        { status: 500 }
      );
    }

    const currentStatus = (currentNode.status as string) ?? "";
    if (logChange && titleChanged) {
      const reason = `タイトル変更:\n「${currentTitle || "(なし)"}」\n↓\n「${newTitle}」`;
      await supabase.from("node_status_history").insert({
        node_id: id.trim(),
        from_status: currentStatus,
        to_status: currentStatus,
        reason,
        consumed_at: now,
      });
    }
    if (logChange && dueDateChanged) {
      const fromDisplay = dueDateToDisplay(currentDueNorm ?? null);
      const toDisplay = newDueNorm == null ? "未設定" : dueDateToDisplay(newDueNorm);
      const reason = `期日変更:\n「${fromDisplay}」\n↓\n「${toDisplay}」`;
      const { error: histErr } = await supabase.from("node_status_history").insert({
        node_id: id.trim(),
        from_status: currentStatus,
        to_status: currentStatus,
        reason,
        consumed_at: now,
      });
      if (histErr) console.warn("[nodes PATCH] due_date history insert failed:", histErr.message);
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
