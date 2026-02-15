import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAndUser } from "@/lib/supabase/server";

/**
 * Nodes API
 * - GET  : list nodes (latest updated first)
 * - POST : create node
 */

export async function GET() {
  const { supabase, user } = await getSupabaseAndUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data, error } = await supabase
    .from("nodes")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, data: data ?? [] });
}

export async function POST(req: NextRequest) {
  const { supabase, user } = await getSupabaseAndUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: any = null;

  // 1) JSON parse
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON" },
      { status: 400 }
    );
  }

  // 2) Extract & validate
  const rawTitle = typeof body?.title === "string" ? body.title : "";
  const title = rawTitle.trim();

  if (!title) {
    return NextResponse.json(
      {
        ok: false,
        error: "title is required (string)",
        received: body,
        typeofTitle: typeof body?.title,
      },
      { status: 400 }
    );
  }

  const nodeContext =
    typeof body?.context === "string" ? body.context.trim() : null;

  const parent_id =
    typeof body?.parent_id === "string" && body.parent_id.trim() !== ""
      ? body.parent_id.trim()
      : null;

  const sibling_order =
    typeof body?.sibling_order === "number" ? body.sibling_order : 0;

  const status =
    typeof body?.status === "string" && body.status.trim() !== ""
      ? body.status.trim()
      : "CAPTURED";

  const temperature =
    typeof body?.temperature === "number" ? body.temperature : 50;

  // tags: string[]
  const tags =
    Array.isArray(body?.tags) && body.tags.every((t: any) => typeof t === "string")
      ? body.tags
      : [];

  // 3) Insert（user_id を付与して RLS と整合）
  const { data, error } = await supabase
    .from("nodes")
    .insert({
      user_id: user.id,
      title,
      context: nodeContext,
      parent_id,
      sibling_order,
      status,
      temperature,
      tags,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, data });
}
