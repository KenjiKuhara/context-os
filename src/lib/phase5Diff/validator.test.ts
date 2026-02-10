/**
 * Phase 5-A: validateDiff の単体テスト（52 準拠）
 * MVP: type === "relation" のみ。
 */

import { describe, it, expect } from "vitest";
import { validateDiff } from "./validator";

const validNodeIds = ["node-a", "node-b", "node-c"];

const validRelationDiff = {
  diff_id: "550e8400-e29b-41d4-a716-446655440001",
  type: "relation",
  target_node_id: "node-a",
  change: {
    action: "add",
    from_node_id: "node-a",
    to_node_id: "node-b",
    relation_type: "depends_on",
  },
  reason: "A が終わらないと B に進めないため。",
  generated_from: { organizer_run_id: "run-1", attempt_id: 0 },
  created_at: new Date().toISOString(),
};

describe("validateDiff", () => {
  it("正常な relation Diff は VALID", () => {
    const out = validateDiff(validRelationDiff, { validNodeIds });
    expect(out.result).toBe("VALID");
    expect(out.errors).toHaveLength(0);
  });

  it("from_node_id と to_node_id が同じなら INVALID", () => {
    const diff = {
      ...validRelationDiff,
      change: {
        ...validRelationDiff.change,
        from_node_id: "node-a",
        to_node_id: "node-a",
      },
    };
    const out = validateDiff(diff, { validNodeIds });
    expect(out.result).toBe("INVALID");
    expect(out.errors.some((e) => e.includes("different"))).toBe(true);
  });

  it("from_node_id が validNodeIds に無いなら INVALID", () => {
    const diff = {
      ...validRelationDiff,
      change: {
        ...validRelationDiff.change,
        from_node_id: "node-x",
      },
    };
    const out = validateDiff(diff, { validNodeIds });
    expect(out.result).toBe("INVALID");
    expect(out.errors.some((e) => e.includes("from_node_id") && e.includes("validNodeIds"))).toBe(true);
  });

  it("target_node_id が validNodeIds に無いなら INVALID", () => {
    const diff = {
      ...validRelationDiff,
      target_node_id: "node-x",
    };
    const out = validateDiff(diff, { validNodeIds });
    expect(out.result).toBe("INVALID");
    expect(out.errors.some((e) => e.includes("target_node_id"))).toBe(true);
  });

  it("既存 relation と重複なら INVALID（existingRelations を渡した場合）", () => {
    const existingRelations = [
      { from_node_id: "node-a", to_node_id: "node-b", relation_type: "depends_on" },
    ];
    const out = validateDiff(validRelationDiff, { validNodeIds, existingRelations });
    expect(out.result).toBe("INVALID");
    expect(out.errors.some((e) => e.includes("already exists"))).toBe(true);
  });

  it("既存 relation に無い組み合わせなら VALID（existingRelations を渡した場合）", () => {
    const existingRelations = [
      { from_node_id: "node-a", to_node_id: "node-c", relation_type: "related" },
    ];
    const out = validateDiff(validRelationDiff, { validNodeIds, existingRelations });
    expect(out.result).toBe("VALID");
  });

  it("diff が null なら INVALID", () => {
    const out = validateDiff(null, { validNodeIds });
    expect(out.result).toBe("INVALID");
    expect(out.errors.length).toBeGreaterThan(0);
  });

  it("type が relation でないなら INVALID", () => {
    const out = validateDiff({ ...validRelationDiff, type: "decomposition" }, { validNodeIds });
    expect(out.result).toBe("INVALID");
    expect(out.errors.some((e) => e.includes("relation"))).toBe(true);
  });
});
