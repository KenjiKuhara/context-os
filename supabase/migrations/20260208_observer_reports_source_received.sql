-- Phase 3-1: observer_reports 監査用カラム
-- source: 送信元識別（例: observer_python）
-- received_at: API がリクエストを受信した時刻（サーバー側）

ALTER TABLE observer_reports
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;

COMMENT ON COLUMN observer_reports.source IS '送信元識別子（例: observer_python）';
COMMENT ON COLUMN observer_reports.received_at IS 'API がリクエストを受信した時刻';
