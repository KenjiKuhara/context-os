/**
 * Phase 5-A/5-B/5-C: OrganizerReport → Diff[] 変換（53 準拠）
 * relation_proposals / grouping_proposals / decomposition_proposals を Diff に変換する。
 */

import type { OrganizerReport } from "@/lib/proposalQuality/types";
import type { Diff, TransformContext } from "./types";

export interface TransformOutput {
  diffs: Diff[];
  warnings: string[];
}

/**
 * OrganizerReport から Diff の配列を生成する。
 * relation_proposals → relation Diff、grouping_proposals → grouping Diff、decomposition_proposals → decomposition Diff。
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

  // ── relation_proposals（Phase 5-A）──
  if (report.relation_proposals && Array.isArray(report.relation_proposals)) {
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
  }

  // ── grouping_proposals（Phase 5-B）──
  if (report.grouping_proposals && Array.isArray(report.grouping_proposals)) {
    for (let i = 0; i < report.grouping_proposals.length; i++) {
      const proposal = report.grouping_proposals[i];
      if (!proposal || typeof proposal !== "object") {
        warnings.push(`grouping_proposals[${i}] is invalid; skipped`);
        continue;
      }

      const groupLabel = typeof proposal.group_label === "string" ? proposal.group_label.trim() : "";
      const reason = typeof proposal.reason === "string" ? proposal.reason.trim() : "";
      const rawNodeIds = Array.isArray(proposal.node_ids) ? proposal.node_ids : [];

      if (!groupLabel) {
        warnings.push(`grouping_proposals[${i}]: group_label is empty; skipped`);
        continue;
      }
      if (!reason) {
        warnings.push(`grouping_proposals[${i}]: reason is empty; skipped`);
        continue;
      }
      if (rawNodeIds.length < 2) {
        warnings.push(`grouping_proposals[${i}]: node_ids must have at least 2 items; skipped`);
        continue;
      }

      const nodeIds = rawNodeIds
        .filter((id: unknown): id is string => typeof id === "string" && id.trim() !== "")
        .map((id: string) => id.trim());
      const allValid = nodeIds.length >= 2 && nodeIds.every((id) => validSet.has(id));
      if (!allValid || nodeIds.length < 2) {
        warnings.push(`grouping_proposals[${i}]: node_ids must have at least 2 and all in validNodeIds; skipped`);
        continue;
      }

      const diff_id = crypto.randomUUID();
      const created_at = new Date().toISOString();

      diffs.push({
        diff_id,
        type: "grouping",
        target_node_id: nodeIds[0],
        change: {
          group_label: groupLabel,
          node_ids: [...nodeIds],
        },
        reason,
        risk: null,
        generated_from: {
          organizer_run_id: runId,
          attempt_id: attemptId,
          source_proposal: `grouping_proposals[${i}]`,
        },
        created_at,
      });
    }
  }

  // ── decomposition_proposals（Phase 5-C）──
  if (report.decomposition_proposals && Array.isArray(report.decomposition_proposals)) {
    for (let i = 0; i < report.decomposition_proposals.length; i++) {
      const proposal = report.decomposition_proposals[i];
      if (!proposal || typeof proposal !== "object") {
        warnings.push(`decomposition_proposals[${i}] is invalid; skipped`);
        continue;
      }

      const parentNodeId =
        typeof proposal.target_node_id === "string" ? proposal.target_node_id.trim() : "";
      const reason = typeof proposal.reason === "string" ? proposal.reason.trim() : "";
      const rawChildren = Array.isArray(proposal.suggested_children)
        ? proposal.suggested_children
        : [];

      if (!parentNodeId) {
        warnings.push(`decomposition_proposals[${i}]: parent_node_id (target_node_id) is missing; skipped`);
        continue;
      }
      if (!validSet.has(parentNodeId)) {
        warnings.push(`decomposition_proposals[${i}]: parent_node_id not in validNodeIds; skipped`);
        continue;
      }
      if (!reason) {
        warnings.push(`decomposition_proposals[${i}]: reason is empty; skipped`);
        continue;
      }
      if (!Array.isArray(rawChildren) || rawChildren.length < 1) {
        warnings.push(`decomposition_proposals[${i}]: suggested_children must be non-empty array; skipped`);
        continue;
      }

      const add_children: { title: string; context?: string; suggested_status?: string }[] = [];
      for (let j = 0; j < rawChildren.length; j++) {
        const ch = rawChildren[j];
        if (!ch || typeof ch !== "object") {
          warnings.push(`decomposition_proposals[${i}].suggested_children[${j}] is invalid; skipped`);
          continue;
        }
        const title = typeof ch.title === "string" ? ch.title.trim() : "";
        if (!title) {
          warnings.push(`decomposition_proposals[${i}].suggested_children[${j}]: title is empty; skipped`);
          continue;
        }
        const context =
          typeof ch.context === "string" ? ch.context.trim() : undefined;
        const suggested_status =
          typeof ch.suggested_status === "string" && ch.suggested_status.trim() !== ""
            ? ch.suggested_status.trim()
            : undefined;
        add_children.push({ title, ...(context !== undefined && { context }), ...(suggested_status !== undefined && { suggested_status }) });
      }

      if (add_children.length < 1) {
        warnings.push(`decomposition_proposals[${i}]: no valid children after filter; skipped`);
        continue;
      }

      const diff_id = crypto.randomUUID();
      const created_at = new Date().toISOString();

      diffs.push({
        diff_id,
        type: "decomposition",
        target_node_id: parentNodeId,
        change: {
          parent_node_id: parentNodeId,
          add_children,
        },
        reason,
        risk: null,
        generated_from: {
          organizer_run_id: runId,
          attempt_id: attemptId,
          source_proposal: `decomposition_proposals[${i}]`,
        },
        created_at,
      });
    }
  }

  return { diffs, warnings };
}
