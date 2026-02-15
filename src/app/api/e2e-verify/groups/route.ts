/**
 * GET /api/e2e-verify/groups
 *
 * E2E 用: groups と group_members の行数を返す。
 * grouping Apply 後の DB 確認に使用する。
 */

import { NextResponse } from "next/server";
import { getSupabaseAndUser } from "@/lib/supabase/server";

export async function GET() {
  const { supabase, user } = await getSupabaseAndUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const [groupsRes, membersRes] = await Promise.all([
      supabase.from("groups").select("id", { count: "exact", head: true }),
      supabase.from("group_members").select("group_id", { count: "exact", head: true }),
    ]);
    const groupsCount = groupsRes.count ?? 0;
    const groupMembersCount = membersRes.count ?? 0;
    return NextResponse.json({
      ok: true,
      groupsCount,
      groupMembersCount,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
