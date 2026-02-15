-- node_status_history に INSERT ポリシーを追加し、SELECT を「自分のノードのみ」に変更する。
-- 認証対応後、API はセッション付きクライアントを使用するため、
-- authenticated が「自分の node に紐づく行」のみ挿入・参照できるようにする。

DROP POLICY IF EXISTS "history_select_only" ON public.node_status_history;

CREATE POLICY "node_status_history_select_own_node"
  ON public.node_status_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.nodes n
      WHERE n.id = node_status_history.node_id AND n.user_id = auth.uid()
    )
  );

CREATE POLICY "node_status_history_insert_own_node"
  ON public.node_status_history
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.nodes n
      WHERE n.id = node_status_history.node_id AND n.user_id = auth.uid()
    )
  );
