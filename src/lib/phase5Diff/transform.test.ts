/**
 * Phase 5-A: transformOrganizerReportToDiffs の単体テスト（53 準拠）
 * MVP: relation_proposals のみ変換。
 */

import { describe, it, expect } from "vitest";
import { transformOrganizerReportToDiffs } from "./transform";
import type { OrganizerReport } from "@/lib/proposalQuality/types";

const validNodeIds = ["node-a", "node-b", "node-c"];

describe("transformOrganizerReportToDiffs", () => {
  it("relation_proposals が空のときは diffs が空", () => {
    const report: OrganizerReport = {
      decomposition_proposals: [],
      grouping_proposals: [],
      relation_proposals: [],
      summary: "要約",
    };
    const out = transformOrganizerReportToDiffs(report, {
      organizer_run_id: "run-1",
      validNodeIds,
    });
    expect(out.diffs).toHaveLength(0);
    expect(out.warnings).toHaveLength(0);
  });

  it("relation 1 件を正しく Diff に変換する（VALID 想定）", () => {
    const report: OrganizerReport = {
      decomposition_proposals: [],
      grouping_proposals: [],
      relation_proposals: [
        {
          from_node_id: "node-a",
          to_node_id: "node-b",
          relation_type: "depends_on",
          reason: "A が終わらないと B に進めないため。",
        },
      ],
      summary: "要約",
    };
    const out = transformOrganizerReportToDiffs(report, {
      organizer_run_id: "run-1",
      attempt_id: 0,
      validNodeIds,
    });
    expect(out.diffs).toHaveLength(1);
    expect(out.diffs[0].type).toBe("relation");
    expect(out.diffs[0].target_node_id).toBe("node-a");
    expect(out.diffs[0].change.action).toBe("add");
    expect(out.diffs[0].change.from_node_id).toBe("node-a");
    expect(out.diffs[0].change.to_node_id).toBe("node-b");
    expect(out.diffs[0].change.relation_type).toBe("depends_on");
    expect(out.diffs[0].reason).toBe("A が終わらないと B に進めないため。");
    expect(out.diffs[0].diff_id).toBeTruthy();
    expect(out.diffs[0].generated_from.organizer_run_id).toBe("run-1");
    expect(out.diffs[0].created_at).toBeTruthy();
  });

  it("from が validNodeIds に無い proposal はスキップされ warnings に追加", () => {
    const report: OrganizerReport = {
      decomposition_proposals: [],
      grouping_proposals: [],
      relation_proposals: [
        {
          from_node_id: "node-x",
          to_node_id: "node-b",
          relation_type: "related",
          reason: "理由",
        },
      ],
      summary: "要約",
    };
    const out = transformOrganizerReportToDiffs(report, {
      organizer_run_id: "run-1",
      validNodeIds,
    });
    expect(out.diffs).toHaveLength(0);
    expect(out.warnings.some((w) => w.includes("validNodeIds") || w.includes("skipped"))).toBe(true);
  });

  it("from === to の proposal はスキップ", () => {
    const report: OrganizerReport = {
      decomposition_proposals: [],
      grouping_proposals: [],
      relation_proposals: [
        {
          from_node_id: "node-a",
          to_node_id: "node-a",
          relation_type: "related",
          reason: "理由",
        },
      ],
      summary: "要約",
    };
    const out = transformOrganizerReportToDiffs(report, {
      organizer_run_id: "run-1",
      validNodeIds,
    });
    expect(out.diffs).toHaveLength(0);
    expect(out.warnings.some((w) => w.includes("from_node_id") && w.includes("to_node_id"))).toBe(true);
  });

  it("reason が空の proposal はスキップ", () => {
    const report: OrganizerReport = {
      decomposition_proposals: [],
      grouping_proposals: [],
      relation_proposals: [
        {
          from_node_id: "node-a",
          to_node_id: "node-b",
          relation_type: "related",
          reason: "",
        },
      ],
      summary: "要約",
    };
    const out = transformOrganizerReportToDiffs(report, {
      organizer_run_id: "run-1",
      validNodeIds,
    });
    expect(out.diffs).toHaveLength(0);
    expect(out.warnings.some((w) => w.includes("reason"))).toBe(true);
  });
});
