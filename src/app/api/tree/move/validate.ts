/**
 * Tree move リクエストの検証（単体テスト用に分離）。
 * 機密情報は扱わず、body と nodes のみで判定する。
 */

import { isDescendant } from "@/lib/dashboardTree";

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

export type NodeRow = { id: string; parent_id?: string | null; sibling_order?: number | null };

export function validateTreeMove(
  body: { movedNodeId?: unknown; newParentId?: unknown; orderedSiblingIds?: unknown },
  nodes: NodeRow[]
): { ok: true } | { ok: false; error: string; status: number } {
  const movedNodeId = body?.movedNodeId;
  const newParentId = body?.newParentId === null ? null : body?.newParentId;
  const orderedSiblingIds = Array.isArray(body?.orderedSiblingIds)
    ? (body.orderedSiblingIds as unknown[]).filter((x): x is string => typeof x === "string" && UUID_RE.test(x))
    : undefined;

  if (!validUuid(movedNodeId)) {
    return { ok: false, error: "movedNodeId required (UUID)", status: 400 };
  }
  if (newParentId !== null && !validUuid(newParentId)) {
    return { ok: false, error: "newParentId must be null or UUID", status: 400 };
  }
  if (movedNodeId === newParentId) {
    return { ok: false, error: "cannot move node to itself", status: 400 };
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const moved = nodeById.get(movedNodeId);
  if (!moved) {
    return { ok: false, error: "movedNodeId not found", status: 404 };
  }
  if (newParentId !== null && !nodeById.has(newParentId)) {
    return { ok: false, error: "newParentId not found", status: 404 };
  }

  const parentToChildren = buildParentToChildrenFromNodes(nodes);
  if (newParentId !== null && isDescendant(movedNodeId, newParentId, parentToChildren)) {
    return { ok: false, error: "would create cycle (target is descendant of moved)", status: 400 };
  }

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

  if (isReorder && orderedSiblingIds && orderedSiblingIds.length > 0) {
    const oldSet = new Set(oldSiblingIds);
    const hasInvalidId = orderedSiblingIds.some((id) => !oldSet.has(id));
    if (hasInvalidId) {
      return {
        ok: false,
        error: "orderedSiblingIds must only contain current siblings (reorder)",
        status: 400,
      };
    }
  }

  return { ok: true };
}
