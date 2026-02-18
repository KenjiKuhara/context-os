/**
 * Phase 4: 提案品質パイプライン — 内部データ構造
 * 40_proposal_quality.md §3.2 / §4.2、41_phase4_quality_pipeline.md §2 に準拠。
 */

export interface OrganizerReportChild {
  title: string;
  context: string;
  suggested_status?: string;
}

export interface OrganizerDecompositionProposal {
  target_node_id: string;
  target_title: string;
  reason: string;
  suggested_children: OrganizerReportChild[];
}

export interface OrganizerGroupingProposal {
  group_label: string;
  reason: string;
  node_ids: string[];
}

export interface OrganizerRelationProposal {
  from_node_id: string;
  to_node_id: string;
  relation_type: string;
  reason: string;
}

export interface OrganizerReport {
  decomposition_proposals: OrganizerDecompositionProposal[];
  grouping_proposals: OrganizerGroupingProposal[];
  relation_proposals: OrganizerRelationProposal[];
  summary: string;
}

export interface AdvisorOption {
  label: string;
  description?: string;
  pros?: string[];
  cons?: string[];
  next_action: string;
  necessary_info: string;
  criteria_note: string;
  risks: string[];
  suggested_status?: string;
}

export interface AdvisorCriterion {
  name: string;
  description: string;
}

export interface AdvisorReport {
  /** Apply 向けにサーバーが必ず設定する対象 Node ID（focusNodeId 指定時はその値、未指定時は dashboard から選んだ node.id） */
  targetNodeId: string;
  target_node_id: string;
  target_title: string;
  current_status: string;
  options: AdvisorOption[];
  criteria?: AdvisorCriterion[];
  next_decision: string;
  summary: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}
