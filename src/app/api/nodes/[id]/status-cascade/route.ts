/**
 * POST /api/nodes/[id]/status-cascade
 *
 * 親ノードのステータスを「完了・冷却・休眠・中止」に変更する際、
 * 対象ノードと全子孫ノードを同一 target_status に一括更新する。
 * 親のみ変更は許可しない（子孫がいる場合は常に一括）。
 *
 * Body: { target_status: "DONE" | "COOLING" | "DORMANT" | "CANCELLED" }
 * Response: { ok: true, updated_count: number, updated_ids?: string[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAndUser } from "@/lib/supabase/server";
import { isValidStatus } from "@/lib/stateMachine";

const CASCADE_TARGET_STATUSES = ["DONE", "COOLING", "DORMANT", "CANCELLED"] as const;

function isCascadeTarget(s: string): s is (typeof CASCADE_TARGET_STATUSES)[number] {
  return (CASCADE_TARGET_STATUSES as readonly string[]).includes(s);
}

/** node_children から parent_id → child_id[] のマップを組み、nodeId から全子孫 ID を BFS で収集。同一 user_id のノードに限定。 */
async function getDescendantIdsOwnedByUser(
  supabase: Awaited<ReturnType<typeof getSupabaseAndUser>>["supabase"],
  nodeId: string,
  userId: string
): Promise<Set<string>> {
  const { data: links } = await supabase
    .from("node_children")
    .select("parent_id, child_id");
  if (!links || links.length === 0) return new Set();

  const parentToChildren = new Map<string, string[]>();
  for (const row of links) {
    const p = row.parent_id as string;
    const c = row.child_id as string;
    const list = parentToChildren.get(p) ?? [];
    if (!list.includes(c)) list.push(c);
    parentToChildren.set(p, list);
  }

  const result = new Set<string>();
  const queue: string[] = [nodeId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const childIds = parentToChildren.get(id) ?? [];
    for (const cid of childIds) {
      result.add(cid);
      queue.push(cid);
    }
  }

  if (result.size === 0) return result;

  const descendantIds = [...result];
  const { data: nodes } = await supabase
    .from("nodes")
    .select("id")
    .in("id", descendantIds)
    .eq("user_id", userId);
  const owned = new Set<string>();
  for (const row of nodes ?? []) {
    owned.add(row.id as string);
  }
  return owned;
}

export async function POST(
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

    const targetStatusRaw = (body as { target_status?: unknown }).target_status;
    const targetStatus =
      typeof targetStatusRaw === "string" ? targetStatusRaw.trim() : "";
    if (!isCascadeTarget(targetStatus) || !isValidStatus(targetStatus)) {
      return NextResponse.json(
        {
          ok: false,
          error: `target_status must be one of: ${CASCADE_TARGET_STATUSES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const { data: node, error: selErr } = await supabase
      .from("nodes")
      .select("id, status, user_id")
      .eq("id", id.trim())
      .single();

    if (selErr || !node) {
      return NextResponse.json(
        { ok: false, error: "node not found" },
        { status: 404 }
      );
    }

    if ((node.user_id as string) !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const descendantIds = await getDescendantIdsOwnedByUser(
      supabase,
      id.trim(),
      user.id
    );
    const allIds = [id.trim(), ...descendantIds];

    const now = new Date().toISOString();

    const { data: currentRows, error: fetchErr } = await supabase
      .from("nodes")
      .select("id, status")
      .in("id", allIds);

    if (fetchErr) {
      return NextResponse.json(
        { ok: false, error: fetchErr.message },
        { status: 500 }
      );
    }

    const { error: updateErr } = await supabase
      .from("nodes")
      .update({ status: targetStatus, updated_at: now })
      .in("id", allIds);

    if (updateErr) {
      return NextResponse.json(
        { ok: false, error: updateErr.message },
        { status: 500 }
      );
    }

    const historyRows = (currentRows ?? []).map((row) => ({
      node_id: row.id,
      from_status: row.status,
      to_status: targetStatus,
      reason: "cascade",
    }));

    if (historyRows.length > 0) {
      const { error: histErr } = await supabase
        .from("node_status_history")
        .insert(historyRows);

      if (histErr) {
        return NextResponse.json(
          {
            ok: false,
            error: "nodes updated but history insert failed",
            detail: histErr.message,
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      updated_count: allIds.length,
      updated_ids: allIds,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
