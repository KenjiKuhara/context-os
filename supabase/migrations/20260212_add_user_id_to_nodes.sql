-- 認証対応: nodes に user_id を追加し、RLS を auth.uid() = user_id でスコープする。
-- 既存 RLS ポリシー nodes_select_only を削除し、SELECT/INSERT/UPDATE/DELETE を user スコープに変更。

-- 1) nodes に user_id カラム追加（既存行は NULL 許容）
ALTER TABLE nodes
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

COMMENT ON COLUMN nodes.user_id IS '所有者。RLS で auth.uid() = user_id のみアクセス可。';

-- 2) 既存ポリシー削除
DROP POLICY IF EXISTS "nodes_select_only" ON nodes;

-- 3) 新ポリシー: 自分のノードのみ
CREATE POLICY "nodes_select_own"
  ON nodes
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "nodes_insert_own"
  ON nodes
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "nodes_update_own"
  ON nodes
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "nodes_delete_own"
  ON nodes
  FOR DELETE
  USING (auth.uid() = user_id);
