/**
 * POST /api/tree/move
 *
 * Tree D&D: ノード（サブツリー根）の親変更・兄弟順序変更。
 * 正: nodes.parent_id, nodes.sibling_order。移動後に node_children を同期。
 * 循環禁止: newParentId が movedNodeId の子孫のとき 400。
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAndUser } from "@/lib/supabase/server";
import { validateTreeMove, type NodeRow } from "./validate";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validUuid(s: unknown): s is string {
  return typeof s === "string" && UUID_RE.test(s.trim());
}

function buildParentToChildrenFromNodes(
  nodes: Array<{ id: string; parent_id?: string | null }>
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const n of nodes) {
    const pid = n.parent_id?.trim();
    if (!pid || pid === n.id) continue;
    const list = map.get(pid) ?? [];
    if (!list.includes(n.id)) list.push(n.id);
    map.set(pid, list);
  }
  return map;
}

export async function POST(req: NextRequest) {
  const { supabase, user } = await getSupabaseAndUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => null);
    const logReject = (reason: string, movedNodeId: unknown, newParentId: unknown) => {
      console.warn("[tree/move] reject", {
        movedNodeId: typeof movedNodeId === "string" ? movedNodeId.slice(0, 8) : "",
        newParentId: newParentId === null ? null : (newParentId as string).slice(0, 8),
        reason,
      });
    };

    const { data: allNodes, error: fetchErr } = await supabase
      .from("nodes")
      .select("id, parent_id, sibling_order")
      .limit(2000);

    if (fetchErr) throw fetchErr;
    const nodes = (allNodes ?? []) as NodeRow[];
    const validation = validateTreeMove(body ?? {}, nodes);
    if (!validation.ok) {
      logReject(validation.error, body?.movedNodeId, body?.newParentId);
      return NextResponse.json({ ok: false, error: validation.error }, { status: validation.status });
    }

    const movedNodeId = body?.movedNodeId as string;
    const newParentId = body?.newParentId === null ? null : (body?.newParentId as string);
    const orderedSiblingIds = Array.isArray(body?.orderedSiblingIds)
      ? (body.orderedSiblingIds as unknown[]).filter((x): x is string => typeof x === "string" && UUID_RE.test(x))
      : undefined;

    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const moved = nodeById.get(movedNodeId)!;
    const parentToChildren = buildParentToChildrenFromNodes(nodes);
    const oldParentId = moved.parent_id?.trim() ?? null;
    const isReorder = oldParentId === newParentId;

    const oldSiblingIds =
      oldParentId === null
        ? nodes.filter((n) => !n.parent_id?.trim()).map((n) => n.id)
        : (parentToChildren.get(oldParentId) ?? []).slice().sort((a, b) => {
            const oa = nodeById.get(a)?.sibling_order ?? 999;
            const ob = nodeById.get(b)?.sibling_order ?? 999;
            return oa - ob;
          });

    let newSiblingIds: string[];
    if (orderedSiblingIds && orderedSiblingIds.length > 0) {
      if (isReorder) {
        const orderedSet = new Set(orderedSiblingIds);
        const missing = oldSiblingIds.filter((id) => !orderedSet.has(id));
        newSiblingIds = [...orderedSiblingIds, ...missing];
      } else {
        newSiblingIds = orderedSiblingIds;
      }
    } else if (isReorder) {
      newSiblingIds = oldSiblingIds;
    } else {
      const newSiblings =
        newParentId === null
          ? nodes.filter((n) => !n.parent_id?.trim()).map((n) => n.id)
          : (parentToChildren.get(newParentId) ?? []).slice().sort((a, b) => {
              const oa = nodeById.get(a)?.sibling_order ?? 999;
              const ob = nodeById.get(b)?.sibling_order ?? 999;
              return oa - ob;
            });
      newSiblingIds = newParentId === null
        ? [...newSiblings.filter((id) => id !== movedNodeId), movedNodeId]
        : [...newSiblings.filter((id) => id !== movedNodeId), movedNodeId];
    }

    const updates: Array<{ id: string; parent_id: string | null; sibling_order: number }> = [];
    if (isReorder) {
      newSiblingIds.forEach((id, i) => {
        if (!nodeById.has(id)) return;
        updates.push({ id, parent_id: newParentId, sibling_order: i });
      });
    } else {
      updates.push({
        id: movedNodeId,
        parent_id: newParentId,
        sibling_order: Math.max(0, newSiblingIds.indexOf(movedNodeId)),
      });
      const oldSiblingsWithoutMoved = oldSiblingIds.filter((id) => id !== movedNodeId);
      oldSiblingsWithoutMoved.forEach((id, i) => {
        updates.push({ id, parent_id: oldParentId, sibling_order: i });
      });
      newSiblingIds.forEach((id, i) => {
        if (id === movedNodeId) return;
        if (!nodeById.has(id)) return;
        updates.push({ id, parent_id: newParentId, sibling_order: i });
      });
    }

    const deduped = new Map<string, { id: string; parent_id: string | null; sibling_order: number }>();
    for (const u of updates) {
      const existing = deduped.get(u.id);
      if (!existing || (u.id === movedNodeId && !isReorder)) deduped.set(u.id, u);
      else existing.sibling_order = u.sibling_order;
    }

    for (const u of deduped.values()) {
      const { error: upErr } = await supabase
        .from("nodes")
        .update({ parent_id: u.parent_id, sibling_order: u.sibling_order })
        .eq("id", u.id);
      if (upErr) throw upErr;
    }

    const affectedParentIds = new Set<string>();
    if (oldParentId) affectedParentIds.add(oldParentId);
    if (newParentId) affectedParentIds.add(newParentId);
    for (const parentId of affectedParentIds) {
      const { data: children } = await supabase
        .from("nodes")
        .select("id")
        .eq("parent_id", parentId)
        .order("sibling_order", { ascending: true });
      const childIds = (children ?? []).map((r) => r.id as string);
      await supabase.from("node_children").delete().eq("parent_id", parentId);
      for (const cid of childIds) {
        const { error: insErr } = await supabase.from("node_children").insert({
          parent_id: parentId,
          child_id: cid,
        });
        if (insErr && insErr.code !== "23505") throw insErr;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
