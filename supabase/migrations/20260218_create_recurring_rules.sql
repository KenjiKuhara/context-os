-- 繰り返しタスク生成（Recurring Task Generator）。ルールのみ保存し、実行日に直近1件だけ nodes を生成する。

CREATE TABLE IF NOT EXISTS public.recurring_rules (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title         TEXT         NOT NULL,
  schedule_type TEXT         NOT NULL,
  time_of_day   TEXT         NOT NULL,
  start_at      TIMESTAMPTZ  NOT NULL,
  end_at        TIMESTAMPTZ   NULL,
  next_run_at   TIMESTAMPTZ  NOT NULL,
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recurring_rules_user_id ON public.recurring_rules (user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_rules_job ON public.recurring_rules (is_active, next_run_at);

COMMENT ON TABLE public.recurring_rules IS '繰り返しタスクのルール。定期ジョブが next_run_at を満たしたとき nodes に1件だけ生成し、next_run_at を次回に更新する。';
COMMENT ON COLUMN public.recurring_rules.title IS '生成されるノードのタイトル';
COMMENT ON COLUMN public.recurring_rules.schedule_type IS 'daily / weekly / monthly';
COMMENT ON COLUMN public.recurring_rules.time_of_day IS '実行時刻（HH:MM）';
COMMENT ON COLUMN public.recurring_rules.start_at IS 'この日時以降に生成開始';
COMMENT ON COLUMN public.recurring_rules.end_at IS 'この日時を超えたら生成停止。NULL は無期限';
COMMENT ON COLUMN public.recurring_rules.next_run_at IS '次に生成する実行日時';
