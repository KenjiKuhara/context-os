-- Phase 5-B: グループ（Organizer grouping Apply 用）
-- 1 グループ = 1 行。メンバーは group_members で多対多。
-- 60_phase5_grouping_data_model.md §3 準拠。

CREATE TABLE IF NOT EXISTS groups (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  group_label  TEXT         NOT NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id   UUID         NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  node_id    UUID         NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, node_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_node ON group_members (node_id);

COMMENT ON TABLE groups IS 'Phase 5-B grouping。1 Apply = 1 行。';
COMMENT ON TABLE group_members IS 'Phase 5-B grouping。1 グループに属する Node。';
