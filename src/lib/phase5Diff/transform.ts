/**
 * Phase 5-A: OrganizerReport → Diff[] 変換（53 準拠）
 * MVP では relation_proposals のみを Diff に変換する。
 */

import type { OrganizerReport } from "@/lib/proposalQuality/types";
import type { Diff, TransformContext } from "./types";

export interface TransformOutput {
  diffs: Diff[];
  warnings: string[];
}

/**
 * OrganizerReport から Diff の配列を生成する。
 * MVP: relation_proposals のみ変換。decomposition / grouping は含めない。
 */
export function transformOrganizerReportToDiffs(
  report: OrganizerReport,
  context: TransformContext
): TransformOutput {
  const diffs: Diff[] = [];
  const warnings: string[] = [];
  const validSet = new Set(context.validNodeIds);

  const runId = context.organizer_run_id;
  const attemptId = context.attempt_id ?? 0;

  if (!report.relation_proposals || !Array.isArray(report.relation_proposals)) {
    return { diffs, warnings };
  }

  for (let i = 0; i < report.relation_proposals.length; i++) {
    const proposal = report.relation_proposals[i];
    if (!proposal || typeof proposal !== "object") {
      warnings.push(`relation_proposals[${i}] is invalid; skipped`);
      continue;
    }

    const fromNodeId = typeof proposal.from_node_id === "string" ? proposal.from_node_id.trim() : "";
    const toNodeId = typeof proposal.to_node_id === "string" ? proposal.to_node_id.trim() : "";
    const relationType = typeof proposal.relation_type === "string" ? proposal.relation_type.trim() : "";
    const reason = typeof proposal.reason === "string" ? proposal.reason.trim() : "";

    if (!validSet.has(fromNodeId) || !validSet.has(toNodeId)) {
      warnings.push(`relation_proposals[${i}]: from or to not in validNodeIds; skipped`);
      continue;
    }
    if (!reason) {
      warnings.push(`relation_proposals[${i}]: reason is empty; skipped`);
      continue;
    }
    if (fromNodeId === toNodeId) {
      warnings.push(`relation_proposals[${i}]: from_node_id === to_node_id; skipped`);
      continue;
    }
    if (!relationType) {
      warnings.push(`relation_proposals[${i}]: relation_type is empty; skipped`);
      continue;
    }

    const diff_id = crypto.randomUUID();
    const created_at = new Date().toISOString();

    diffs.push({
      diff_id,
      type: "relation",
      target_node_id: fromNodeId,
      change: {
        action: "add",
        from_node_id: fromNodeId,
        to_node_id: toNodeId,
        relation_type: relationType,
      },
      reason,
      risk: null,
      generated_from: {
        organizer_run_id: runId,
        attempt_id: attemptId,
        source_proposal: `relation_proposals[${i}]`,
      },
      created_at,
    });
  }

  return { diffs, warnings };
}
