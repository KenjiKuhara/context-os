/**
 * GET /api/e2e-verify/groups
 *
 * E2E 用: groups と group_members の行数を返す。
 * grouping Apply 後の DB 確認に使用する。
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  try {
    const [groupsRes, membersRes] = await Promise.all([
      supabaseAdmin.from("groups").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("group_members").select("group_id", { count: "exact", head: true }),
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
