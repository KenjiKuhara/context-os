/**
 * Phase 5-A/5-B: Diff の事前検証（52 準拠）
 * type === "relation" と type === "grouping" を検証する。
 */

import type { DiffValidationOutput, ValidateDiffContext } from "./types";

export function validateDiff(diff: unknown, context: ValidateDiffContext): DiffValidationOutput {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!diff || typeof diff !== "object") {
    return { result: "INVALID", errors: ["diff is required and must be an object"], warnings: [] };
  }

  const d = diff as Record<string, unknown>;

  if (d.type !== "relation" && d.type !== "grouping") {
    return { result: "INVALID", errors: ["type must be 'relation' or 'grouping'"], warnings: [] };
  }

  const diff_id = typeof d.diff_id === "string" ? d.diff_id.trim() : "";
  const target_node_id = typeof d.target_node_id === "string" ? d.target_node_id.trim() : "";
  const reason = typeof d.reason === "string" ? d.reason.trim() : "";
  const change = d.change;
  const generated_from = d.generated_from;

  if (!diff_id) errors.push("diff_id is required and must be non-empty");
  if (!target_node_id) errors.push("target_node_id is required");
  if (!reason) errors.push("reason is required and must be non-empty");
  if (!generated_from || typeof generated_from !== "object") {
    errors.push("generated_from is required");
  } else {
    const gf = generated_from as Record<string, unknown>;
    if (typeof gf.organizer_run_id !== "string" || !gf.organizer_run_id.trim()) {
      errors.push("generated_from.organizer_run_id is required");
    }
  }

  const validSet = new Set(context.validNodeIds);

  if (d.type === "relation") {
    if (!change || typeof change !== "object") {
      errors.push("change is required and must be an object");
    } else {
      const c = change as Record<string, unknown>;
      const action = c.action;
      const from_node_id = typeof c.from_node_id === "string" ? c.from_node_id.trim() : "";
      const to_node_id = typeof c.to_node_id === "string" ? c.to_node_id.trim() : "";
      const relation_type = typeof c.relation_type === "string" ? c.relation_type.trim() : "";

      if (action !== "add") errors.push("change.action must be 'add' (MVP)");
      if (!from_node_id) errors.push("change.from_node_id is required");
      if (!to_node_id) errors.push("change.to_node_id is required");
      if (!relation_type) errors.push("change.relation_type is required");

      if (from_node_id && to_node_id && from_node_id === to_node_id) {
        errors.push("from_node_id and to_node_id must be different");
      }

      if (target_node_id && !validSet.has(target_node_id)) {
        errors.push("target_node_id is not in validNodeIds");
      }
      if (from_node_id && !validSet.has(from_node_id)) {
        errors.push("change.from_node_id is not in validNodeIds");
      }
      if (to_node_id && !validSet.has(to_node_id)) {
        errors.push("change.to_node_id is not in validNodeIds");
      }

      if (context.existingRelations && from_node_id && to_node_id && relation_type) {
        const exists = context.existingRelations.some(
          (r) =>
            r.from_node_id === from_node_id &&
            r.to_node_id === to_node_id &&
            r.relation_type === relation_type
        );
        if (exists) {
          errors.push("relation already exists (same from, to, relation_type)");
        }
      }
    }
  } else if (d.type === "grouping") {
    if (!change || typeof change !== "object") {
      errors.push("change is required and must be an object");
    } else {
      const c = change as Record<string, unknown>;
      const group_label = typeof c.group_label === "string" ? c.group_label.trim() : "";
      const node_ids = Array.isArray(c.node_ids)
        ? (c.node_ids as unknown[]).map((id) => (typeof id === "string" ? id.trim() : "")).filter(Boolean)
        : [];

      if (!group_label) errors.push("change.group_label is required and must be non-empty");
      if (node_ids.length < 2) errors.push("change.node_ids must have at least 2 items");

      for (const nid of node_ids) {
        if (nid && !validSet.has(nid)) {
          errors.push(`change.node_ids contains id not in validNodeIds: ${nid}`);
          break;
        }
      }
      if (target_node_id && node_ids.length > 0 && !validSet.has(target_node_id)) {
        errors.push("target_node_id is not in validNodeIds");
      }
    }
  }

  if (errors.length > 0) {
    return { result: "INVALID", errors, warnings };
  }

  return { result: "VALID", errors: [], warnings };
}
