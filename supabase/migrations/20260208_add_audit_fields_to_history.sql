-- Phase 2-α: node_status_history に監査フィールドを追加
--
-- 根拠:
--   23_Human_Confirmation_Model.md §2 — Confirmation Object のデータ構造
--   23_Human_Confirmation_Model.md §5.2 — history レコードへの記録形式（MVP）
--   18_Skill_Governance.md §3 — source + confirmation の二層ガード
--   17_Skill_EstimateStatus.md §6.1 — 拡張枠（source）
--
-- すべて NULL 許容。既存レコードとの後方互換を保つ。
-- Phase 2-α では「受け皿のみ」。必須化は Phase 2-β 以降。

ALTER TABLE node_status_history
  ADD COLUMN IF NOT EXISTS source           TEXT,
  ADD COLUMN IF NOT EXISTS confirmation_id  UUID,
  ADD COLUMN IF NOT EXISTS confirmed_by     TEXT,
  ADD COLUMN IF NOT EXISTS confirmed_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ui_action        TEXT,
  ADD COLUMN IF NOT EXISTS proposed_change  JSONB,
  ADD COLUMN IF NOT EXISTS consumed         BOOLEAN,
  ADD COLUMN IF NOT EXISTS consumed_at      TIMESTAMPTZ;

-- インデックス: confirmation_id で検索（将来の consumed 検証用）
CREATE INDEX IF NOT EXISTS idx_history_confirmation_id
  ON node_status_history (confirmation_id)
  WHERE confirmation_id IS NOT NULL;

-- インデックス: source で絞り込み（監査クエリ用）
CREATE INDEX IF NOT EXISTS idx_history_source
  ON node_status_history (source)
  WHERE source IS NOT NULL;

COMMENT ON COLUMN node_status_history.source IS '呼び出し元の識別 (human_ui / ai_agent / mcp / batch / skill_chain)。18_Skill_Governance §3.1';
COMMENT ON COLUMN node_status_history.confirmation_id IS '承認の一意ID (UUID)。23_Human_Confirmation_Model §2.1';
COMMENT ON COLUMN node_status_history.confirmed_by IS '承認者の種別 (human)。23 §2.1';
COMMENT ON COLUMN node_status_history.confirmed_at IS '承認日時 (ISO 8601)。23 §2.1';
COMMENT ON COLUMN node_status_history.ui_action IS '承認を発生させた UI 操作の識別子。23 §2.1';
COMMENT ON COLUMN node_status_history.proposed_change IS '承認された変更内容 {type, from, to}。23 §2.1';
COMMENT ON COLUMN node_status_history.consumed IS 'この承認が Apply に使用済みか。23 §4';
COMMENT ON COLUMN node_status_history.consumed_at IS '使用された日時。23 §4';
