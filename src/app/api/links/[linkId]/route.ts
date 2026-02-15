/**
 * PATCH /api/links/[linkId] — リンク/メモの編集（label・url 任意、url は http(s) のみ）
 * DELETE /api/links/[linkId] — 削除。RLS で他ユーザー分は不可。
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAndUser } from "@/lib/supabase/server";

const HTTP_OK = /^https?:\/\//i;

function normalizeUrl(url: unknown): string | null {
  if (url == null || typeof url !== "string") return null;
  const s = url.trim();
  return s === "" ? null : s;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ linkId: string }> }
) {
  const { supabase, user } = await getSupabaseAndUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { linkId } = await params;
    if (!linkId?.trim()) {
      return NextResponse.json(
        { ok: false, error: "link id is required" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const hasLabel = "label" in body;
    const hasUrl = "url" in body;

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (hasLabel) {
      const label =
        typeof body.label === "string" ? body.label.trim() : "";
      update.label = label;
    }
    if (hasUrl) {
      const url = normalizeUrl(body.url);
      if (url !== null && !HTTP_OK.test(url)) {
        return NextResponse.json(
          { ok: false, error: "url must start with http:// or https://" },
          { status: 400 }
        );
      }
      update.url = url;
    }

    const { data: row, error } = await supabase
      .from("node_links")
      .update(update)
      .eq("id", linkId.trim())
      .select("id, node_id, label, url, created_at, updated_at")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }
    if (!row) {
      return NextResponse.json(
        { ok: false, error: "link not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, data: row });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ linkId: string }> }
) {
  const { supabase, user } = await getSupabaseAndUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { linkId } = await params;
    if (!linkId?.trim()) {
      return NextResponse.json(
        { ok: false, error: "link id is required" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("node_links")
      .delete()
      .eq("id", linkId.trim());

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
