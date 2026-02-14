/**
 * PATCH /api/nodes/:id
 *
 * タスクタイトルのインライン編集用。title 更新と変更時のみ node_status_history に履歴を残す。
 * 同一リクエスト内で nodes 更新 → history insert の順で実行。
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
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

    const titleRaw = (body as { title?: unknown }).title;
    const logChange = (body as { logChange?: unknown }).logChange !== false;

    if (titleRaw === undefined || titleRaw === null) {
      return NextResponse.json(
        { ok: false, error: "title is required" },
        { status: 400 }
      );
    }
    const newTitle = typeof titleRaw === "string" ? titleRaw.trim() : "";
    if (newTitle === "") {
      return NextResponse.json(
        { ok: false, error: "title must not be empty" },
        { status: 400 }
      );
    }

    const { data: currentNode, error: selErr } = await supabaseAdmin
      .from("nodes")
      .select("id, title, status, updated_at")
      .eq("id", id.trim())
      .single();

    if (selErr || !currentNode) {
      return NextResponse.json(
        { ok: false, error: "node not found" },
        { status: 404 }
      );
    }

    const currentTitle = typeof currentNode.title === "string" ? currentNode.title.trim() : "";
    if (currentTitle === newTitle) {
      return NextResponse.json({ ok: true, unchanged: true });
    }

    const now = new Date().toISOString();
    const { error: updErr } = await supabaseAdmin
      .from("nodes")
      .update({ title: newTitle, updated_at: now })
      .eq("id", id.trim());

    if (updErr) {
      return NextResponse.json(
        { ok: false, error: updErr.message },
        { status: 500 }
      );
    }

    if (logChange) {
      const reason = `タイトル変更:\n「${currentTitle || "(なし)"}」\n↓\n「${newTitle}」`;
      const currentStatus = (currentNode.status as string) ?? "";
      const { error: histErr } = await supabaseAdmin
        .from("node_status_history")
        .insert({
          node_id: id.trim(),
          from_status: currentStatus,
          to_status: currentStatus,
          reason,
        });

      if (histErr) {
        console.warn("[nodes PATCH] history insert failed:", histErr.message);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
