/**
 * Phase 4: 40 のサンプル 10 件（O1〜O5, A1〜A5）を用いた Validator 自動テスト。
 * 41_phase4_quality_pipeline.md §5 に準拠。
 */

import { describe, it, expect } from "vitest";
import { validateOrganizerReport, validateAdvisorReport } from "./validator";
import {
  ORGANIZER_O1_VALID,
  ORGANIZER_O2_VALID,
  ORGANIZER_O2_WITH_DECOMPOSITION,
  ORGANIZER_O3_VALID,
  ORGANIZER_O4_VALID,
  ORGANIZER_O5_VALID,
  ORGANIZER_INVALID_EMPTY_SUMMARY,
  ORGANIZER_INVALID_BAD_ID,
  ADVISOR_A1_VALID,
  ADVISOR_A2_VALID,
  ADVISOR_A3_VALID,
  ADVISOR_A5_VALID,
  ADVISOR_A4_EDGE,
  ADVISOR_INVALID_SINGLE_OPTION,
  ADVISOR_INVALID_NO_RISKS,
} from "./samples";

const EMPTY_NODE_IDS: string[] = [];
const NODE_IDS_N1 = ["n1"];
const NODE_IDS_N1_N2 = ["n1", "n2"];
const NODE_IDS_N1_N2_N3 = ["n1", "n2", "n3"];

describe("validateOrganizerReport", () => {
  it("O1: Node 0 件 → 空配列 + 非空 summary で Must 通過", () => {
    const r = validateOrganizerReport(ORGANIZER_O1_VALID, EMPTY_NODE_IDS);
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("O2: Node 1 件 → summary のみで Must 通過", () => {
    const r = validateOrganizerReport(ORGANIZER_O2_VALID, NODE_IDS_N1);
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("O2: decomposition あり → target_node_id n1, reason, suggested_children 2+ で Must 通過", () => {
    const r = validateOrganizerReport(ORGANIZER_O2_WITH_DECOMPOSITION, NODE_IDS_N1);
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("O3: 同一トピック 3 件 → grouping に reason, summary で Must 通過", () => {
    const r = validateOrganizerReport(ORGANIZER_O3_VALID, NODE_IDS_N1_N2_N3);
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("O4: Node n1 分解 → decomposition に n1, 2+ children, reason で Must 通過", () => {
    const r = validateOrganizerReport(ORGANIZER_O4_VALID, NODE_IDS_N1);
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("O5: n1→n2 依存 → relation_proposals で Must 通過", () => {
    const r = validateOrganizerReport(ORGANIZER_O5_VALID, NODE_IDS_N1_N2);
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("Organizer: summary が空なら Must 違反", () => {
    const r = validateOrganizerReport(ORGANIZER_INVALID_EMPTY_SUMMARY, EMPTY_NODE_IDS);
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(1);
    expect(r.errors.some((e) => e.includes("summary"))).toBe(true);
  });

  it("Organizer: 存在しない node_id なら Must 違反", () => {
    const r = validateOrganizerReport(ORGANIZER_INVALID_BAD_ID, NODE_IDS_N1);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("not in valid node list") || e.includes("invalid id"))).toBe(true);
  });
});

describe("validateAdvisorReport", () => {
  it("A1: NEEDS_DECISION n1 → options 2+、各 4 項目で Must 通過", () => {
    const r = validateAdvisorReport(ADVISOR_A1_VALID, NODE_IDS_N1);
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("A2: 同 n1、遷移候補あり → options 2+、4 項目で Must 通過", () => {
    const r = validateAdvisorReport(ADVISOR_A2_VALID, NODE_IDS_N1);
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("A3: 下書き文案 n1 → options 2+、description, risks で Must 通過", () => {
    const r = validateAdvisorReport(ADVISOR_A3_VALID, NODE_IDS_N1);
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("A4: Node 0 件の境界 → 不正な形の report は Must 違反", () => {
    const r = validateAdvisorReport(ADVISOR_A4_EDGE, EMPTY_NODE_IDS);
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(1);
  });

  it("A5: n1 指定、criteria 2+、4 項目で Must 通過", () => {
    const r = validateAdvisorReport(ADVISOR_A5_VALID, NODE_IDS_N1);
    expect(r.ok).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("Advisor: options が 1 件だけなら Must 違反", () => {
    const r = validateAdvisorReport(ADVISOR_INVALID_SINGLE_OPTION, NODE_IDS_N1);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("at least 2"))).toBe(true);
  });

  it("Advisor: 各 option の risks が空なら Must 違反", () => {
    const r = validateAdvisorReport(ADVISOR_INVALID_NO_RISKS, NODE_IDS_N1);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("risks"))).toBe(true);
  });
});

describe("selfCorrection prompt", () => {
  it("buildCorrectionPrompt は errors を箇条書きで含む（インテグレーションは selfCorrection 単体で確認）", async () => {
    const { buildCorrectionPrompt } = await import("./selfCorrection");
    const prompt = buildCorrectionPrompt(["summary must be non-empty"], ["n1", "n2"]);
    expect(prompt).toContain("検証エラー");
    expect(prompt).toContain("summary must be non-empty");
    expect(prompt).toContain("n1");
  });
});
