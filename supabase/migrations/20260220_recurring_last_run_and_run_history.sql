-- 繰り返し実行の可視化と二重実行防止: last_run_* と run_history

-- recurring_rules に最後実行情報を追加
ALTER TABLE public.recurring_rules
  ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS last_run_for_date DATE NULL;

COMMENT ON COLUMN public.recurring_rules.last_run_at IS '最後に実行した日時（実時刻）';
COMMENT ON COLUMN public.recurring_rules.last_run_for_date IS '最後に実行した対象日（JST）。二重実行防止に使用。';

-- 実行履歴テーブル（ルール単位の実行とジョブ実行の両方を記録）
CREATE TABLE IF NOT EXISTS public.run_history (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id           UUID         NULL REFERENCES public.recurring_rules(id) ON DELETE CASCADE,
  run_at            TIMESTAMPTZ  NOT NULL,
  run_for_date      DATE         NULL,
  trigger           TEXT         NOT NULL CHECK (trigger IN ('cron', 'manual', 'clear')),
  created_node_id   UUID         NULL REFERENCES public.nodes(id) ON DELETE SET NULL,
  processed_count   INT          NULL,
  created_count     INT          NULL
);

COMMENT ON TABLE public.run_history IS '繰り返し実行の履歴。ルール単位の実行（rule_id 設定）とジョブ実行（rule_id NULL, processed_count/created_count）の両方。';
COMMENT ON COLUMN public.run_history.rule_id IS 'NULL のときはジョブ実行のみの記録（Cron が動いたが 0 件更新など）';
COMMENT ON COLUMN public.run_history.processed_count IS 'ジョブ実行時のみ。処理したルール数。';
COMMENT ON COLUMN public.run_history.created_count IS 'ジョブ実行時のみ。実際に挿入した件数。';

CREATE INDEX IF NOT EXISTS idx_run_history_rule_id ON public.run_history (rule_id);
CREATE INDEX IF NOT EXISTS idx_run_history_run_at ON public.run_history (run_at);

-- RLS: 自分のルールの履歴 + ジョブ実行（rule_id NULL）は全員閲覧可
ALTER TABLE public.run_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "run_history_select_own_or_job"
  ON public.run_history
  FOR SELECT
  USING (
    rule_id IS NULL
    OR rule_id IN (SELECT id FROM public.recurring_rules WHERE user_id = auth.uid())
  );

-- insert: 自分のルールに対する manual / clear のみ。cron およびジョブ実行レコードは service role で insert
CREATE POLICY "run_history_insert_own"
  ON public.run_history
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND rule_id IS NOT NULL
    AND rule_id IN (SELECT id FROM public.recurring_rules WHERE user_id = auth.uid())
    AND trigger IN ('manual', 'clear')
  );
