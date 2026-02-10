/**
 * Phase 5-A/5-B/5-C: validateDiff の単体テスト（52 準拠）
 * relation / grouping / decomposition を検証。
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

  it("type が relation / grouping / decomposition のいずれでもないなら INVALID", () => {
    const out = validateDiff({ ...validRelationDiff, type: "unknown" }, { validNodeIds });
    expect(out.result).toBe("INVALID");
    expect(out.errors.some((e) => e.includes("decomposition"))).toBe(true);
  });

  const validGroupingDiff = {
    diff_id: "550e8400-e29b-41d4-a716-446655440002",
    type: "grouping",
    target_node_id: "node-a",
    change: {
      group_label: "同じプロジェクト",
      node_ids: ["node-a", "node-b", "node-c"],
    },
    reason: "3 件とも同じプロジェクトのタスクに見えるため。",
    generated_from: { organizer_run_id: "run-1", attempt_id: 0 },
  };

  it("正常な grouping Diff は VALID", () => {
    const out = validateDiff(validGroupingDiff, { validNodeIds });
    expect(out.result).toBe("VALID");
    expect(out.errors).toHaveLength(0);
  });

  it("grouping で node_ids が 1 件のみなら INVALID", () => {
    const diff = {
      ...validGroupingDiff,
      change: { ...validGroupingDiff.change, node_ids: ["node-a"] },
    };
    const out = validateDiff(diff, { validNodeIds });
    expect(out.result).toBe("INVALID");
    expect(out.errors.some((e) => e.includes("node_ids") && e.includes("2"))).toBe(true);
  });

  it("grouping で node_ids のいずれかが validNodeIds に無いなら INVALID", () => {
    const diff = {
      ...validGroupingDiff,
      change: { ...validGroupingDiff.change, node_ids: ["node-a", "node-x"] },
    };
    const out = validateDiff(diff, { validNodeIds });
    expect(out.result).toBe("INVALID");
    expect(out.errors.some((e) => e.includes("validNodeIds"))).toBe(true);
  });

  it("grouping で reason が空なら INVALID", () => {
    const diff = { ...validGroupingDiff, reason: "" };
    const out = validateDiff(diff, { validNodeIds });
    expect(out.result).toBe("INVALID");
    expect(out.errors.some((e) => e.includes("reason"))).toBe(true);
  });

  it("grouping で group_label が空なら INVALID", () => {
    const diff = {
      ...validGroupingDiff,
      change: { ...validGroupingDiff.change, group_label: "" },
    };
    const out = validateDiff(diff, { validNodeIds });
    expect(out.result).toBe("INVALID");
    expect(out.errors.some((e) => e.includes("group_label"))).toBe(true);
  });

  it("grouping で target_node_id が validNodeIds に無いなら INVALID", () => {
    const diff = { ...validGroupingDiff, target_node_id: "node-x" };
    const out = validateDiff(diff, { validNodeIds });
    expect(out.result).toBe("INVALID");
    expect(out.errors.some((e) => e.includes("target_node_id"))).toBe(true);
  });

  const validDecompositionDiff = {
    diff_id: "550e8400-e29b-41d4-a716-446655440003",
    type: "decomposition",
    target_node_id: "node-a",
    change: {
      parent_node_id: "node-a",
      add_children: [
        { title: "子1", context: "文脈1" },
        { title: "子2", context: "文脈2", suggested_status: "READY" },
      ],
    },
    reason: "大きなタスクを2つに分けるため。",
    generated_from: { organizer_run_id: "run-1", attempt_id: 0 },
  };

  it("正常な decomposition Diff は VALID", () => {
    const out = validateDiff(validDecompositionDiff, { validNodeIds });
    expect(out.result).toBe("VALID");
    expect(out.errors).toHaveLength(0);
  });

  it("decomposition で parent_node_id が validNodeIds に無いなら INVALID", () => {
    const diff = {
      ...validDecompositionDiff,
      change: { ...validDecompositionDiff.change, parent_node_id: "node-x" },
    };
    const out = validateDiff(diff, { validNodeIds });
    expect(out.result).toBe("INVALID");
    expect(out.errors.some((e) => e.includes("parent_node_id") && e.includes("validNodeIds"))).toBe(true);
  });

  it("decomposition で add_children が空なら INVALID", () => {
    const diff = {
      ...validDecompositionDiff,
      change: { ...validDecompositionDiff.change, add_children: [] },
    };
    const out = validateDiff(diff, { validNodeIds });
    expect(out.result).toBe("INVALID");
    expect(out.errors.some((e) => e.includes("add_children") && e.includes("1"))).toBe(true);
  });

  it("decomposition で子の title が空なら INVALID", () => {
    const diff = {
      ...validDecompositionDiff,
      change: {
        ...validDecompositionDiff.change,
        add_children: [{ title: "子1" }, { title: "", context: "x" }],
      },
    };
    const out = validateDiff(diff, { validNodeIds });
    expect(out.result).toBe("INVALID");
    expect(out.errors.some((e) => e.includes("title") && e.includes("non-empty"))).toBe(true);
  });

  it("decomposition で子の title が重複していると NEEDS_REVIEW", () => {
    const diff = {
      ...validDecompositionDiff,
      change: {
        ...validDecompositionDiff.change,
        add_children: [
          { title: "同じタイトル" },
          { title: "同じタイトル" },
        ],
      },
    };
    const out = validateDiff(diff, { validNodeIds });
    expect(out.result).toBe("NEEDS_REVIEW");
    expect(out.warnings.some((w) => w.includes("duplicate"))).toBe(true);
  });
});
