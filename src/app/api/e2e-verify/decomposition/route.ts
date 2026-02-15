/**
 * GET /api/e2e-verify/decomposition
 *
 * E2E 用: nodes と node_children の行数を返す。
 * decomposition Apply 後の DB 確認に使用する。
 */

import { NextResponse } from "next/server";
import { getSupabaseAndUser } from "@/lib/supabase/server";

export async function GET() {
  const { supabase, user } = await getSupabaseAndUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const [nodesRes, childrenRes] = await Promise.all([
      supabase.from("nodes").select("id", { count: "exact", head: true }),
      supabase.from("node_children").select("parent_id", { count: "exact", head: true }),
    ]);
    const nodesCount = nodesRes.count ?? 0;
    const nodeChildrenCount = childrenRes.count ?? 0;
    return NextResponse.json({
      ok: true,
      nodesCount,
      nodeChildrenCount,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
