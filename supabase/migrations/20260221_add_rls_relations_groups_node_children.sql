-- Phase Security: RLS を未設定テーブルに追加
-- Supabase Security Advisor 指摘 5件に対応
-- 対象: relations / groups / group_members / node_children / observer_reports
--
-- 設計方針:
--   - user_id 列を持たないテーブルは nodes.user_id を JOIN して所有者を判定
--   - service_role は RLS をバイパスするため、API ルート (service_role 使用) には影響しない
--   - anon key 経由の直接 DB アクセスからデータを保護することが目的

-- ─── 1. relations ────────────────────────────────────────────
-- from_node_id / to_node_id が自分の nodes を参照している行のみ操作可

ALTER TABLE public.relations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "relations_select_own"
  ON public.relations FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = relations.from_node_id AND n.user_id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = relations.to_node_id   AND n.user_id = auth.uid())
  );

CREATE POLICY "relations_insert_own"
  ON public.relations FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = relations.from_node_id AND n.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = relations.to_node_id   AND n.user_id = auth.uid())
  );

CREATE POLICY "relations_update_own"
  ON public.relations FOR UPDATE
  USING  (EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = relations.from_node_id AND n.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = relations.from_node_id AND n.user_id = auth.uid()));

CREATE POLICY "relations_delete_own"
  ON public.relations FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = relations.from_node_id AND n.user_id = auth.uid()));

-- ─── 2. groups ───────────────────────────────────────────────
-- groups 自体に user_id はないため group_members → nodes で所有者を判定

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "groups_select_own"
  ON public.groups FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      JOIN public.nodes n ON n.id = gm.node_id
      WHERE gm.group_id = groups.id AND n.user_id = auth.uid()
    )
  );

CREATE POLICY "groups_insert_own"
  ON public.groups FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "groups_update_own"
  ON public.groups FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      JOIN public.nodes n ON n.id = gm.node_id
      WHERE gm.group_id = groups.id AND n.user_id = auth.uid()
    )
  );

CREATE POLICY "groups_delete_own"
  ON public.groups FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      JOIN public.nodes n ON n.id = gm.node_id
      WHERE gm.group_id = groups.id AND n.user_id = auth.uid()
    )
  );

-- ─── 3. group_members ────────────────────────────────────────
-- node_id が自分の nodes を参照している行のみ操作可

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group_members_select_own"
  ON public.group_members FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = group_members.node_id AND n.user_id = auth.uid())
  );

CREATE POLICY "group_members_insert_own"
  ON public.group_members FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = group_members.node_id AND n.user_id = auth.uid())
  );

CREATE POLICY "group_members_delete_own"
  ON public.group_members FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = group_members.node_id AND n.user_id = auth.uid())
  );

-- ─── 4. node_children ────────────────────────────────────────
-- parent_id / child_id が自分の nodes を参照している行のみ操作可

ALTER TABLE public.node_children ENABLE ROW LEVEL SECURITY;

CREATE POLICY "node_children_select_own"
  ON public.node_children FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = node_children.parent_id AND n.user_id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = node_children.child_id  AND n.user_id = auth.uid())
  );

CREATE POLICY "node_children_insert_own"
  ON public.node_children FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = node_children.parent_id AND n.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = node_children.child_id  AND n.user_id = auth.uid())
  );

CREATE POLICY "node_children_delete_own"
  ON public.node_children FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = node_children.parent_id AND n.user_id = auth.uid())
  );

-- ─── 5. observer_reports ─────────────────────────────────────
-- USING (true) → 未認証アクセス可の脆弱性を修正
-- SELECT は認証済みユーザーのみに限定（書き込みは service_role のみ）

DROP POLICY IF EXISTS "observer_reports_select_only" ON public.observer_reports;

CREATE POLICY "observer_reports_select_authenticated"
  ON public.observer_reports FOR SELECT
  USING (auth.uid() IS NOT NULL);
