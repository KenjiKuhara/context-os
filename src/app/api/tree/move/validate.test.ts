/**
 * POST /api/tree/move の検証ロジック単体テスト。
 * 循環禁止・存在チェック・orderedSiblingIds 妥当性を担保する。
 */

import { describe, it, expect } from "vitest";
import { validateTreeMove, type NodeRow } from "./validate";

const uuid = (s: string) => `${s.padEnd(8, "0")}-0000-4000-8000-000000000000`;

describe("validateTreeMove", () => {
  const nodes: NodeRow[] = [
    { id: uuid("a"), parent_id: null, sibling_order: 0 },
    { id: uuid("b"), parent_id: uuid("a"), sibling_order: 0 },
    { id: uuid("c"), parent_id: uuid("b"), sibling_order: 0 },
  ];

  it("正常: 同一親内 reorder は valid", () => {
    const result = validateTreeMove(
      {
        movedNodeId: uuid("c"),
        newParentId: uuid("b"),
        orderedSiblingIds: [uuid("c")],
      },
      nodes
    );
    expect(result.ok).toBe(true);
  });

  it("正常: newParentId null（ルート化）は valid", () => {
    const result = validateTreeMove(
      {
        movedNodeId: uuid("b"),
        newParentId: null,
        orderedSiblingIds: [uuid("a"), uuid("b")],
      },
      nodes
    );
    expect(result.ok).toBe(true);
  });

  it("reject: movedNode を自分の子孫の下へ（循環）で 400", () => {
    const result = validateTreeMove(
      {
        movedNodeId: uuid("a"),
        newParentId: uuid("c"),
        orderedSiblingIds: [uuid("b"), uuid("a")],
      },
      nodes
    );
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.error).toContain("cycle");
  });

  it("reject: movedNodeId を自分自身へ（newParentId === movedNodeId）で 400", () => {
    const result = validateTreeMove(
      {
        movedNodeId: uuid("a"),
        newParentId: uuid("a"),
        orderedSiblingIds: [uuid("a")],
      },
      nodes
    );
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.error).toContain("itself");
  });

  it("reject: movedNodeId が存在しないで 404", () => {
    const result = validateTreeMove(
      {
        movedNodeId: "ffffffff-0000-4000-8000-000000000000",
        newParentId: uuid("a"),
      },
      nodes
    );
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
    expect(result.error).toContain("movedNodeId not found");
  });

  it("reject: newParentId が存在しないで 404", () => {
    const result = validateTreeMove(
      {
        movedNodeId: uuid("b"),
        newParentId: "eeeeeeee-0000-4000-8000-000000000000",
      },
      nodes
    );
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
    expect(result.error).toContain("newParentId not found");
  });

  it("reject: reorder 時 orderedSiblingIds が兄弟全体と一致しないで 400", () => {
    const result = validateTreeMove(
      {
        movedNodeId: uuid("c"),
        newParentId: uuid("b"),
        orderedSiblingIds: [uuid("c")],
      },
      [
        ...nodes,
        { id: uuid("d"), parent_id: uuid("b"), sibling_order: 1 },
      ]
    );
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.error).toContain("orderedSiblingIds");
  });

  it("reject: movedNodeId が UUID でないで 400", () => {
    const result = validateTreeMove({ movedNodeId: "not-uuid", newParentId: uuid("a") }, nodes);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
  });

  it("正常: newParentId null で newParentId not found にならない", () => {
    const result = validateTreeMove(
      { movedNodeId: uuid("b"), newParentId: null },
      nodes
    );
    expect(result.ok).toBe(true);
  });
});
