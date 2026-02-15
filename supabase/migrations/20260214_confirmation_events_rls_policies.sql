-- confirmation_events に RLS ポリシーを追加する。
-- 認証対応後、API はセッション付きクライアント（anon + Cookie）を使用するため、
-- authenticated が「自分の node に紐づく行」のみ操作できるようにする。
-- node_id で public.nodes と紐づき、nodes.user_id = auth.uid() でスコープする。

CREATE POLICY "confirmation_events_insert_own_node"
  ON public.confirmation_events
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.nodes n
      WHERE n.id = confirmation_events.node_id AND n.user_id = auth.uid()
    )
  );

CREATE POLICY "confirmation_events_select_own_node"
  ON public.confirmation_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.nodes n
      WHERE n.id = confirmation_events.node_id AND n.user_id = auth.uid()
    )
  );

CREATE POLICY "confirmation_events_update_own_node"
  ON public.confirmation_events
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.nodes n
      WHERE n.id = confirmation_events.node_id AND n.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.nodes n
      WHERE n.id = confirmation_events.node_id AND n.user_id = auth.uid()
    )
  );

CREATE POLICY "confirmation_events_delete_own_node"
  ON public.confirmation_events
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.nodes n
      WHERE n.id = confirmation_events.node_id AND n.user_id = auth.uid()
    )
  );
