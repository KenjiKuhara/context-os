-- Phase 5-C: 親子関係（decomposition Apply 用）
-- 04_Domain_Model の parent_id と併存。親子の明示的リンクとして使用。
-- 64_phase5_c_decomposition_data_model.md 準拠。

CREATE TABLE IF NOT EXISTS node_children (
  parent_id   UUID         NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  child_id    UUID         NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (parent_id, child_id)
);

CREATE INDEX IF NOT EXISTS idx_node_children_child ON node_children (child_id);

COMMENT ON TABLE node_children IS 'Phase 5-C decomposition。親子リンク。1 Apply = N 行。';
