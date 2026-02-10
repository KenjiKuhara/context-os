-- Phase 5-B: groups / group_members の適用と存在確認を一括実行
-- Supabase Dashboard → SQL Editor でこのファイルを実行するか、
-- 上から順にコピーして実行してください。

-- ========== 1. マイグレーション適用 ==========
CREATE TABLE IF NOT EXISTS groups (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  group_label  TEXT         NOT NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id   UUID         NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  node_id    UUID         NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, node_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_node ON group_members (node_id);

COMMENT ON TABLE groups IS 'Phase 5-B grouping。1 Apply = 1 行。';
COMMENT ON TABLE group_members IS 'Phase 5-B grouping。1 グループに属する Node。';

-- ========== 2. 存在確認（groups） ==========
-- groups が作られている
SELECT 'groups table exists' AS check_name, count(*) AS table_count
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'groups';

-- ========== 3. 存在確認（group_members） ==========
-- group_members が作られている
SELECT 'group_members table exists' AS check_name, count(*) AS table_count
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'group_members';

-- ========== 4. 存在確認（group_members.node_id → nodes(id) FK） ==========
-- group_members.node_id が nodes(id) を参照できている（FK が存在する）
SELECT 'group_members.node_id references nodes(id)' AS check_name, count(*) AS fk_count
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
WHERE tc.table_schema = 'public'
  AND tc.table_name = 'group_members'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND kcu.column_name = 'node_id'
  AND ccu.table_name = 'nodes' AND ccu.column_name = 'id';

-- ========== 5. 存在確認（idx_group_members_node） ==========
-- idx_group_members_node がある
SELECT 'idx_group_members_node exists' AS check_name, count(*) AS index_count
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'group_members'
  AND indexname = 'idx_group_members_node';

-- ========== 6. 行数確認 ==========
SELECT count(*) AS groups_count FROM groups;
SELECT count(*) AS group_members_count FROM group_members;
