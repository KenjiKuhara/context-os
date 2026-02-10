/**
 * Phase 5-A: Diff（変更提案）の型定義
 * 51_phase5_diff_schema.md に準拠。MVP は relation のみ。
 */

/** 判定結果（52 準拠） */
export type DiffValidationResult = "VALID" | "INVALID" | "NEEDS_REVIEW";

export interface DiffValidationOutput {
  result: DiffValidationResult;
  errors: string[];
  warnings: string[];
}

/** relation 用 change（51 §3.1） */
export interface RelationChange {
  action: "add" | "remove";
  from_node_id: string;
  to_node_id: string;
  relation_type: string;
}

/** generated_from（51） */
export interface DiffGeneratedFrom {
  organizer_run_id: string;
  attempt_id?: number;
  source_proposal?: string;
}

/** Diff（MVP では relation のみ。51 の共通 + relation change） */
export interface Diff {
  diff_id: string;
  type: "relation";
  target_node_id: string;
  change: RelationChange;
  reason: string;
  risk?: string | null;
  generated_from: DiffGeneratedFrom;
  created_at?: string;
}

/** Transform のコンテキスト（53） */
export interface TransformContext {
  organizer_run_id: string;
  attempt_id?: number;
  validNodeIds: string[];
}

/** Validator のコンテキスト（52） */
export interface ValidateDiffContext {
  validNodeIds: string[];
  /** 既存の relation 一覧。渡された場合のみ重複チェックする。 */
  existingRelations?: { from_node_id: string; to_node_id: string; relation_type: string }[];
}
