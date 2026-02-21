-- ============================================================
-- 1. 不足FKインデックスを追加
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_nodes_user_id ON public.nodes (user_id);
CREATE INDEX IF NOT EXISTS idx_run_history_created_node_id ON public.run_history (created_node_id) WHERE created_node_id IS NOT NULL;

-- ============================================================
-- 2. node_events に RLS を有効化（現在無効 = 全ユーザーが読み書き可能）
-- ============================================================
ALTER TABLE public.node_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "node_events_select_own"
  ON public.node_events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.nodes n
    WHERE n.id = node_events.node_id
      AND n.user_id = (SELECT auth.uid())
  ));

CREATE POLICY "node_events_insert_own"
  ON public.node_events FOR INSERT
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.nodes n
      WHERE n.id = node_events.node_id
        AND n.user_id = (SELECT auth.uid())
    )
  );

-- ============================================================
-- 3. RLSポリシー: auth.uid() → (SELECT auth.uid()) に統一
--    （行ごとの再評価を防ぎ 5-10x 高速化）
-- ============================================================

-- nodes
DROP POLICY IF EXISTS nodes_select_own ON public.nodes;
DROP POLICY IF EXISTS nodes_insert_own ON public.nodes;
DROP POLICY IF EXISTS nodes_update_own ON public.nodes;
DROP POLICY IF EXISTS nodes_delete_own ON public.nodes;

CREATE POLICY nodes_select_own ON public.nodes FOR SELECT
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY nodes_insert_own ON public.nodes FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY nodes_update_own ON public.nodes FOR UPDATE
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY nodes_delete_own ON public.nodes FOR DELETE
  USING ((SELECT auth.uid()) = user_id);

-- recurring_rules
DROP POLICY IF EXISTS recurring_rules_select_own ON public.recurring_rules;
DROP POLICY IF EXISTS recurring_rules_insert_own ON public.recurring_rules;
DROP POLICY IF EXISTS recurring_rules_update_own ON public.recurring_rules;
DROP POLICY IF EXISTS recurring_rules_delete_own ON public.recurring_rules;

CREATE POLICY recurring_rules_select_own ON public.recurring_rules FOR SELECT
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY recurring_rules_insert_own ON public.recurring_rules FOR INSERT
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL AND (SELECT auth.uid()) = user_id);
CREATE POLICY recurring_rules_update_own ON public.recurring_rules FOR UPDATE
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY recurring_rules_delete_own ON public.recurring_rules FOR DELETE
  USING ((SELECT auth.uid()) = user_id);

-- node_children
DROP POLICY IF EXISTS node_children_select_own ON public.node_children;
DROP POLICY IF EXISTS node_children_insert_own ON public.node_children;
DROP POLICY IF EXISTS node_children_delete_own ON public.node_children;

CREATE POLICY node_children_select_own ON public.node_children FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = node_children.parent_id AND n.user_id = (SELECT auth.uid()))
    OR EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = node_children.child_id AND n.user_id = (SELECT auth.uid()))
  );
CREATE POLICY node_children_insert_own ON public.node_children FOR INSERT
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = node_children.parent_id AND n.user_id = (SELECT auth.uid()))
    AND EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = node_children.child_id AND n.user_id = (SELECT auth.uid()))
  );
CREATE POLICY node_children_delete_own ON public.node_children FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = node_children.parent_id AND n.user_id = (SELECT auth.uid())));

-- node_status_history
DROP POLICY IF EXISTS node_status_history_select_own_node ON public.node_status_history;
DROP POLICY IF EXISTS node_status_history_insert_own_node ON public.node_status_history;

CREATE POLICY node_status_history_select_own_node ON public.node_status_history FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = node_status_history.node_id AND n.user_id = (SELECT auth.uid())));
CREATE POLICY node_status_history_insert_own_node ON public.node_status_history FOR INSERT
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = node_status_history.node_id AND n.user_id = (SELECT auth.uid()))
  );

-- node_links
DROP POLICY IF EXISTS node_links_select_own_node ON public.node_links;
DROP POLICY IF EXISTS node_links_insert_own_node ON public.node_links;
DROP POLICY IF EXISTS node_links_update_own_node ON public.node_links;
DROP POLICY IF EXISTS node_links_delete_own_node ON public.node_links;

CREATE POLICY node_links_select_own_node ON public.node_links FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = node_links.node_id AND n.user_id = (SELECT auth.uid())));
CREATE POLICY node_links_insert_own_node ON public.node_links FOR INSERT
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = node_links.node_id AND n.user_id = (SELECT auth.uid()))
  );
CREATE POLICY node_links_update_own_node ON public.node_links FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = node_links.node_id AND n.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = node_links.node_id AND n.user_id = (SELECT auth.uid())));
CREATE POLICY node_links_delete_own_node ON public.node_links FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = node_links.node_id AND n.user_id = (SELECT auth.uid())));

-- confirmation_events
DROP POLICY IF EXISTS confirmation_events_select_own_node ON public.confirmation_events;
DROP POLICY IF EXISTS confirmation_events_insert_own_node ON public.confirmation_events;
DROP POLICY IF EXISTS confirmation_events_update_own_node ON public.confirmation_events;
DROP POLICY IF EXISTS confirmation_events_delete_own_node ON public.confirmation_events;

CREATE POLICY confirmation_events_select_own_node ON public.confirmation_events FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = confirmation_events.node_id AND n.user_id = (SELECT auth.uid())));
CREATE POLICY confirmation_events_insert_own_node ON public.confirmation_events FOR INSERT
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = confirmation_events.node_id AND n.user_id = (SELECT auth.uid()))
  );
CREATE POLICY confirmation_events_update_own_node ON public.confirmation_events FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = confirmation_events.node_id AND n.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = confirmation_events.node_id AND n.user_id = (SELECT auth.uid())));
CREATE POLICY confirmation_events_delete_own_node ON public.confirmation_events FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = confirmation_events.node_id AND n.user_id = (SELECT auth.uid())));

-- relations
DROP POLICY IF EXISTS relations_select_own ON public.relations;
DROP POLICY IF EXISTS relations_insert_own ON public.relations;
DROP POLICY IF EXISTS relations_update_own ON public.relations;
DROP POLICY IF EXISTS relations_delete_own ON public.relations;

CREATE POLICY relations_select_own ON public.relations FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = relations.from_node_id AND n.user_id = (SELECT auth.uid()))
    OR EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = relations.to_node_id AND n.user_id = (SELECT auth.uid()))
  );
CREATE POLICY relations_insert_own ON public.relations FOR INSERT
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = relations.from_node_id AND n.user_id = (SELECT auth.uid()))
    AND EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = relations.to_node_id AND n.user_id = (SELECT auth.uid()))
  );
CREATE POLICY relations_update_own ON public.relations FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = relations.from_node_id AND n.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = relations.from_node_id AND n.user_id = (SELECT auth.uid())));
CREATE POLICY relations_delete_own ON public.relations FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = relations.from_node_id AND n.user_id = (SELECT auth.uid())));

-- groups
DROP POLICY IF EXISTS groups_select_own ON public.groups;
DROP POLICY IF EXISTS groups_insert_own ON public.groups;
DROP POLICY IF EXISTS groups_update_own ON public.groups;
DROP POLICY IF EXISTS groups_delete_own ON public.groups;

CREATE POLICY groups_select_own ON public.groups FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.group_members gm
    JOIN public.nodes n ON n.id = gm.node_id
    WHERE gm.group_id = groups.id AND n.user_id = (SELECT auth.uid())
  ));
CREATE POLICY groups_insert_own ON public.groups FOR INSERT
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY groups_update_own ON public.groups FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.group_members gm
    JOIN public.nodes n ON n.id = gm.node_id
    WHERE gm.group_id = groups.id AND n.user_id = (SELECT auth.uid())
  ));
CREATE POLICY groups_delete_own ON public.groups FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.group_members gm
    JOIN public.nodes n ON n.id = gm.node_id
    WHERE gm.group_id = groups.id AND n.user_id = (SELECT auth.uid())
  ));

-- group_members
DROP POLICY IF EXISTS group_members_select_own ON public.group_members;
DROP POLICY IF EXISTS group_members_insert_own ON public.group_members;
DROP POLICY IF EXISTS group_members_delete_own ON public.group_members;

CREATE POLICY group_members_select_own ON public.group_members FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = group_members.node_id AND n.user_id = (SELECT auth.uid())));
CREATE POLICY group_members_insert_own ON public.group_members FOR INSERT
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = group_members.node_id AND n.user_id = (SELECT auth.uid()))
  );
CREATE POLICY group_members_delete_own ON public.group_members FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.nodes n WHERE n.id = group_members.node_id AND n.user_id = (SELECT auth.uid())));

-- observer_reports
DROP POLICY IF EXISTS observer_reports_select_authenticated ON public.observer_reports;
CREATE POLICY observer_reports_select_authenticated ON public.observer_reports FOR SELECT
  USING ((SELECT auth.uid()) IS NOT NULL);

-- run_history
DROP POLICY IF EXISTS run_history_select_own_or_job ON public.run_history;
DROP POLICY IF EXISTS run_history_insert_own ON public.run_history;

CREATE POLICY run_history_select_own_or_job ON public.run_history FOR SELECT
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND (rule_id IS NULL OR rule_id IN (
      SELECT id FROM public.recurring_rules WHERE user_id = (SELECT auth.uid())
    ))
  );
CREATE POLICY run_history_insert_own ON public.run_history FOR INSERT
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND rule_id IS NOT NULL
    AND rule_id IN (SELECT id FROM public.recurring_rules WHERE user_id = (SELECT auth.uid()))
    AND trigger = ANY(ARRAY['manual', 'clear'])
  );

-- ============================================================
-- 4. set_updated_at 関数の search_path を固定（セキュリティ）
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF (
    (OLD.title IS NOT DISTINCT FROM NEW.title) AND
    (OLD.context IS NOT DISTINCT FROM NEW.context) AND
    (OLD.status IS NOT DISTINCT FROM NEW.status) AND
    (OLD.temperature IS NOT DISTINCT FROM NEW.temperature) AND
    (OLD.tags IS NOT DISTINCT FROM NEW.tags) AND
    (OLD.due_date IS NOT DISTINCT FROM NEW.due_date)
  ) THEN
    NEW.updated_at = OLD.updated_at;
  ELSE
    NEW.updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- 5. 未使用インデックスを削除（書き込みオーバーヘッド削減）
-- ============================================================
DROP INDEX IF EXISTS public.idx_node_children_child;
DROP INDEX IF EXISTS public.idx_nodes_temperature;
DROP INDEX IF EXISTS public.idx_node_events_event_type;
DROP INDEX IF EXISTS public.idx_node_events_created_at;
DROP INDEX IF EXISTS public.idx_history_confirmation_id;
DROP INDEX IF EXISTS public.idx_history_source;
DROP INDEX IF EXISTS public.idx_conf_node_confirmed;
DROP INDEX IF EXISTS public.idx_conf_unconsumed;
DROP INDEX IF EXISTS public.idx_relations_from;
DROP INDEX IF EXISTS public.idx_relations_to;
DROP INDEX IF EXISTS public.idx_group_members_node;
