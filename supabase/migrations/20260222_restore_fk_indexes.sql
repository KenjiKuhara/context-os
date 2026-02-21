-- 前回「未使用」として削除したが、実はFKカバリングに必要なインデックスを復元
CREATE INDEX IF NOT EXISTS idx_node_children_child_id  ON public.node_children (child_id);
CREATE INDEX IF NOT EXISTS idx_relations_to_node_id    ON public.relations (to_node_id);
CREATE INDEX IF NOT EXISTS idx_group_members_node_id   ON public.group_members (node_id);
