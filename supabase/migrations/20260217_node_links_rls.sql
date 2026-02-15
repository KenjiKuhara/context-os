-- node_links を RLS で保護。nodes の所有者と同一スコープ（node_id 経由）。

ALTER TABLE public.node_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "node_links_select_own_node"
  ON public.node_links
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.nodes n
      WHERE n.id = node_links.node_id AND n.user_id = auth.uid()
    )
  );

CREATE POLICY "node_links_insert_own_node"
  ON public.node_links
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.nodes n
      WHERE n.id = node_links.node_id AND n.user_id = auth.uid()
    )
  );

CREATE POLICY "node_links_update_own_node"
  ON public.node_links
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.nodes n
      WHERE n.id = node_links.node_id AND n.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.nodes n
      WHERE n.id = node_links.node_id AND n.user_id = auth.uid()
    )
  );

CREATE POLICY "node_links_delete_own_node"
  ON public.node_links
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.nodes n
      WHERE n.id = node_links.node_id AND n.user_id = auth.uid()
    )
  );
