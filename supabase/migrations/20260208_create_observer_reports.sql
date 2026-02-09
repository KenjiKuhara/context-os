-- Phase 3-0: observer_reports テーブル
--
-- ObserverReport (19_SubAgent_Observer.md §4.2) の保存先。
-- Observer Agent が生成した提案レポートを永続化し、
-- ダッシュボードから latest を取得して表示する。
--
-- SSOT は本テーブル。ObserverReport の JSON は payload に格納。

CREATE TABLE IF NOT EXISTS observer_reports (
  report_id      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  generated_by   TEXT         NOT NULL DEFAULT 'observer_cli',  -- 'observer_cli' / 'observer_api' 等
  payload        JSONB        NOT NULL,                         -- ObserverReport JSON (19 §4.2)
  version        TEXT         NOT NULL DEFAULT '1',             -- スキーマバージョン
  source_commit  TEXT,                                          -- git commit hash（optional）
  node_count     INTEGER      NOT NULL DEFAULT 0               -- 観測した Node 数
);

-- 最新レポート取得用（GET /api/observer/reports/latest）
CREATE INDEX IF NOT EXISTS idx_observer_reports_created
  ON observer_reports (created_at DESC);

-- RLS: service_role のみ書き込み可。読み取りは公開（ダッシュボード用）。
ALTER TABLE observer_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "observer_reports_select_only"
  ON observer_reports
  FOR SELECT
  USING (true);

COMMENT ON TABLE observer_reports IS 'ObserverReport 保存先 (19 §4.2)。service_role のみ書き込み可。';
