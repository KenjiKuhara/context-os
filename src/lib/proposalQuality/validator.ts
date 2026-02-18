/**
 * Phase 4: 提案品質 Validator
 * 40_proposal_quality.md Must/Should、41_phase4_quality_pipeline.md §3 に準拠。
 * Must 違反 → errors（ok: false）、Should 違反 → warnings。
 */

import type {
  OrganizerReport,
  AdvisorReport,
  ValidationResult,
} from "./types";

const ORGANIZER_FORBIDDEN_PHRASES = [
  "べき",
  "してください",
  "が必要です",
];
const ADVISOR_FORBIDDEN_WORDS = ["ベスト", "推奨", "正解", "すべき"];

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length >= 1;
}

function hasForbiddenPhrase(text: string, phrases: string[]): boolean {
  const t = text.trim();
  return phrases.some((p) => t.includes(p));
}

/**
 * OrganizerReport を検証する。validNodeIds は入力に存在する Node の ID 一覧。
 */
export function validateOrganizerReport(
  report: unknown,
  validNodeIds: string[]
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!report || typeof report !== "object") {
    return { ok: false, errors: ["report must be an object"], warnings: [] };
  }

  const r = report as Record<string, unknown>;
  const dp = r.decomposition_proposals;
  const gp = r.grouping_proposals;
  const rp = r.relation_proposals;
  const summary = r.summary;

  if (!Array.isArray(dp)) errors.push("decomposition_proposals is required (array)");
  if (!Array.isArray(gp)) errors.push("grouping_proposals is required (array)");
  if (!Array.isArray(rp)) errors.push("relation_proposals is required (array)");
  if (summary === undefined || summary === null) errors.push("summary is required");
  else if (!isNonEmptyString(summary)) errors.push("summary must be non-empty");

  const validSet = new Set(validNodeIds);

  if (Array.isArray(dp)) {
    dp.forEach((item: Record<string, unknown>, i: number) => {
      const tid = item.target_node_id;
      if (typeof tid === "string" && tid && !validSet.has(tid))
        errors.push(`decomposition_proposals[${i}].target_node_id '${tid}' is not in valid node list`);
      const reason = item.reason;
      if (!isNonEmptyString(reason))
        errors.push(`decomposition_proposals[${i}].reason is required and non-empty`);
      const children = item.suggested_children;
      if (Array.isArray(children)) {
        if (children.length < 2)
          errors.push(`decomposition_proposals[${i}].suggested_children must have at least 2 items`);
        children.forEach((c: Record<string, unknown>, j: number) => {
          if (c.title === undefined || c.title === null)
            errors.push(`decomposition_proposals[${i}].suggested_children[${j}].title is required`);
          if (c.context === undefined || c.context === null)
            errors.push(`decomposition_proposals[${i}].suggested_children[${j}].context is required`);
        });
      }
    });
  }

  if (Array.isArray(gp)) {
    gp.forEach((item: Record<string, unknown>, i: number) => {
      const reason = item.reason;
      if (!isNonEmptyString(reason))
        errors.push(`grouping_proposals[${i}].reason is required and non-empty`);
      const ids = item.node_ids;
      if (Array.isArray(ids))
        ids.forEach((id) => {
          if (typeof id === "string" && id && !validSet.has(id))
            errors.push(`grouping_proposals[${i}].node_ids contains invalid id '${id}'`);
        });
    });
  }

  if (Array.isArray(rp)) {
    rp.forEach((item: Record<string, unknown>, i: number) => {
      const from = item.from_node_id;
      const to = item.to_node_id;
      if (typeof from === "string" && from && !validSet.has(from))
        errors.push(`relation_proposals[${i}].from_node_id '${from}' is not in valid node list`);
      if (typeof to === "string" && to && !validSet.has(to))
        errors.push(`relation_proposals[${i}].to_node_id '${to}' is not in valid node list`);
      const reason = item.reason;
      if (!isNonEmptyString(reason))
        errors.push(`relation_proposals[${i}].reason is required and non-empty`);
    });
  }

  if (isNonEmptyString(summary) && hasForbiddenPhrase(summary, ORGANIZER_FORBIDDEN_PHRASES))
    errors.push("summary or reason contains forbidden phrase (e.g. べき, してください)");
  if (Array.isArray(dp)) {
    dp.forEach((item: Record<string, unknown>, i: number) => {
      const reason = item.reason;
      if (isNonEmptyString(reason) && hasForbiddenPhrase(reason, ORGANIZER_FORBIDDEN_PHRASES))
        errors.push(`decomposition_proposals[${i}].reason contains forbidden phrase`);
    });
  }
  if (Array.isArray(gp)) {
    gp.forEach((item: Record<string, unknown>, i: number) => {
      const reason = item.reason;
      if (isNonEmptyString(reason) && hasForbiddenPhrase(reason, ORGANIZER_FORBIDDEN_PHRASES))
        errors.push(`grouping_proposals[${i}].reason contains forbidden phrase`);
    });
  }
  if (Array.isArray(rp)) {
    rp.forEach((item: Record<string, unknown>, i: number) => {
      const reason = item.reason;
      if (isNonEmptyString(reason) && hasForbiddenPhrase(reason, ORGANIZER_FORBIDDEN_PHRASES))
        errors.push(`relation_proposals[${i}].reason contains forbidden phrase`);
    });
  }

  if (isNonEmptyString(summary) && !summary.includes("まず"))
    warnings.push("summary could suggest next step (e.g. まず◯◯)");

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * AdvisorReport を検証する。validNodeIds は入力に存在する Node の ID 一覧。
 * Node 0 件の場合は target_node_id チェックをスキップするため、validNodeIds を空で渡すと「target が無い」はエラーにしない方針も可。
 * ここでは「validNodeIds が空でないときだけ target をチェック」する。
 */
export function validateAdvisorReport(
  report: unknown,
  validNodeIds: string[]
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!report || typeof report !== "object") {
    return { ok: false, errors: ["report must be an object"], warnings: [] };
  }

  const r = report as Record<string, unknown>;
  const targetNodeIdField = r.targetNodeId;
  const targetNodeIdLegacy = r.target_node_id;
  const targetTitle = r.target_title;
  const currentStatus = r.current_status;
  const options = r.options;
  const nextDecision = r.next_decision;
  const summary = r.summary;
  const criteria = r.criteria;

  if (targetNodeIdField === undefined || targetNodeIdField === null) errors.push("targetNodeId is required");
  else if (typeof targetNodeIdField !== "string" || !targetNodeIdField.trim())
    errors.push("targetNodeId must be a non-empty string");
  if (targetNodeIdLegacy === undefined || targetNodeIdLegacy === null) errors.push("target_node_id is required");
  if (targetTitle === undefined || targetTitle === null) errors.push("target_title is required");
  if (currentStatus === undefined || currentStatus === null) errors.push("current_status is required");
  if (!Array.isArray(options)) errors.push("options is required (array)");
  if (nextDecision === undefined || nextDecision === null) errors.push("next_decision is required");
  else if (!isNonEmptyString(nextDecision)) errors.push("next_decision must be non-empty");
  if (summary === undefined || summary === null) errors.push("summary is required");
  else if (!isNonEmptyString(summary)) errors.push("summary must be non-empty");

  const validSet = new Set(validNodeIds);
  if (validNodeIds.length > 0 && typeof targetNodeIdField === "string" && targetNodeIdField && !validSet.has(targetNodeIdField))
    errors.push("targetNodeId is not in valid node list (嘘防止)");
  if (validNodeIds.length > 0 && typeof targetNodeIdLegacy === "string" && targetNodeIdLegacy && !validSet.has(targetNodeIdLegacy))
    errors.push("target_node_id is not in valid node list");

  if (Array.isArray(options)) {
    if (options.length < 2) errors.push("options must have at least 2 items");
    options.forEach((opt: Record<string, unknown>, i: number) => {
      if (!isNonEmptyString(opt.next_action))
        errors.push(`options[${i}].next_action is required`);
      if (!isNonEmptyString(opt.necessary_info))
        errors.push(`options[${i}].necessary_info is required`);
      if (!isNonEmptyString(opt.criteria_note))
        errors.push(`options[${i}].criteria_note is required`);
      const risks = opt.risks;
      if (!Array.isArray(risks) || risks.length < 1)
        errors.push(`options[${i}].risks is required and must have at least 1 item`);
    });
  }

  const fullText = [
    summary,
    nextDecision,
    ...(Array.isArray(options) ? options.map((o: Record<string, unknown>) => String(o.label ?? "") + String(o.description ?? "")) : []),
  ].join(" ");
  if (ADVISOR_FORBIDDEN_WORDS.some((w) => fullText.includes(w)))
    errors.push("output contains forbidden word (e.g. ベスト, 推奨)");

  if (Array.isArray(criteria) && criteria.length < 2)
    warnings.push("criteria should have at least 2 items");
  if (Array.isArray(options)) {
    options.forEach((opt: Record<string, unknown>, i: number) => {
      const label = String(opt.label ?? "");
      if (!/案|パターン|候補/.test(label))
        warnings.push(`options[${i}].label should contain 案/パターン/候補`);
    });
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}
