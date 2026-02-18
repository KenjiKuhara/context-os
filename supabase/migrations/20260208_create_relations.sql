-- Phase 5-A: relations テーブル（04_Domain_Model.md §5 参照関係）
-- Node 間の意味的関連（依存・同一トピック等）を 1 行で表現する。

CREATE TABLE IF NOT EXISTS relations (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  from_node_id    UUID         NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  to_node_id      UUID         NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  relation_type   TEXT         NOT NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 同一 (from, to, type) の重複を防ぐ
CREATE UNIQUE INDEX IF NOT EXISTS idx_relations_from_to_type
  ON relations (from_node_id, to_node_id, relation_type);

CREATE INDEX IF NOT EXISTS idx_relations_from ON relations (from_node_id);
CREATE INDEX IF NOT EXISTS idx_relations_to   ON relations (to_node_id);

COMMENT ON TABLE relations IS 'Node 間の参照関係（Phase 5-A Organizer Apply）。04_Domain_Model.md §5.3';
