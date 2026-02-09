-- Phase 2-γ: confirmation_events テーブル（方式B）
--
-- 根拠:
--   23_Human_Confirmation_Model.md §2 — Confirmation Object SSOT
--   23_Human_Confirmation_Model.md §5.3 — 専用テーブル分離の指針
--   18_Skill_Governance.md §3 — source + confirmation の二層ガード
--
-- このテーブルが Confirmation Object の SSOT となる。
-- node_status_history の confirmation 関連カラムは監査コピーとして残すが、
-- consumed の真の状態は本テーブルが持つ。

CREATE TABLE IF NOT EXISTS confirmation_events (
  confirmation_id  UUID         PRIMARY KEY,
  node_id          UUID         NOT NULL,
  confirmed_by     TEXT         NOT NULL,        -- "human"
  confirmed_at     TIMESTAMPTZ  NOT NULL,
  ui_action        TEXT         NOT NULL,
  proposed_change  JSONB        NOT NULL,        -- { type, from, to }
  consumed         BOOLEAN      NOT NULL DEFAULT FALSE,
  consumed_at      TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ  NOT NULL,        -- confirmed_at + 24h
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- node_id + 時刻でのルックアップ（特定 Node の承認履歴）
CREATE INDEX IF NOT EXISTS idx_conf_node_confirmed
  ON confirmation_events (node_id, confirmed_at DESC);

-- 未消費の承認を高速に検索（Apply 時の検証）
CREATE INDEX IF NOT EXISTS idx_conf_unconsumed
  ON confirmation_events (consumed)
  WHERE consumed = FALSE;

-- 失効判定用（バッチクリーンアップ等）
CREATE INDEX IF NOT EXISTS idx_conf_expires
  ON confirmation_events (expires_at);

COMMENT ON TABLE confirmation_events IS 'Human Confirmation SSOT (23_Human_Confirmation_Model.md §2). 1承認1Apply を担保する。';
COMMENT ON COLUMN confirmation_events.confirmation_id IS '承認の一意 ID (UUID)';
COMMENT ON COLUMN confirmation_events.node_id IS '対象 Node の ID';
COMMENT ON COLUMN confirmation_events.confirmed_by IS '承認者の種別 ("human")';
COMMENT ON COLUMN confirmation_events.confirmed_at IS '承認日時';
COMMENT ON COLUMN confirmation_events.ui_action IS '承認操作の識別子 ("dashboard_apply_button" 等)';
COMMENT ON COLUMN confirmation_events.proposed_change IS '承認された変更内容 { type, from, to }';
COMMENT ON COLUMN confirmation_events.consumed IS 'Apply に使用済みか (1承認1Apply)';
COMMENT ON COLUMN confirmation_events.consumed_at IS '使用された日時';
COMMENT ON COLUMN confirmation_events.expires_at IS '失効日時 (confirmed_at + 24h)';
