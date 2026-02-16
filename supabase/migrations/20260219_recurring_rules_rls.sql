-- recurring_rules を RLS で保護。user_id = auth.uid() の行のみ操作可。

ALTER TABLE public.recurring_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recurring_rules_select_own"
  ON public.recurring_rules
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "recurring_rules_insert_own"
  ON public.recurring_rules
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY "recurring_rules_update_own"
  ON public.recurring_rules
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "recurring_rules_delete_own"
  ON public.recurring_rules
  FOR DELETE
  USING (auth.uid() = user_id);
