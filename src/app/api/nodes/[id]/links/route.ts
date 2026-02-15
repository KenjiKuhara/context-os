/**
 * GET /api/nodes/[id]/links — 当該ノードのリンク/メモ一覧（created_at 昇順）
 * POST /api/nodes/[id]/links — 追加（label 必須、url 任意・空は null・http(s) のみ）
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAndUser } from "@/lib/supabase/server";

const HTTP_OK = /^https?:\/\//i;

function normalizeUrl(url: unknown): string | null {
  if (url == null || typeof url !== "string") return null;
  const s = url.trim();
  return s === "" ? null : s;
}

export async function GET(
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
      return NextResponse.json(
        { ok: false, error: "node id is required" },
        { status: 400 }
      );
    }

    const { data: rows, error } = await supabase
      .from("node_links")
      .select("id, node_id, label, url, created_at, updated_at")
      .eq("node_id", id.trim())
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      items: rows ?? [],
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}

export async function POST(
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
      return NextResponse.json(
        { ok: false, error: "node id is required" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const label =
      typeof body.label === "string" ? body.label.trim() : "";
    const rawUrl = body.url;
    const url = normalizeUrl(rawUrl);

    if (!label) {
      return NextResponse.json(
        { ok: false, error: "label is required" },
        { status: 400 }
      );
    }
    if (url !== null && !HTTP_OK.test(url)) {
      return NextResponse.json(
        { ok: false, error: "url must start with http:// or https://" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const { data: row, error } = await supabase
      .from("node_links")
      .insert({
        node_id: id.trim(),
        label,
        url,
        updated_at: now,
      })
      .select("id, node_id, label, url, created_at, updated_at")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
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
