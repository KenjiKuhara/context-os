-- nodes.user_id を NOT NULL に変更する。
-- スキーマは public を明示（public.nodes）。
--
-- RLS のため、user_id IS NULL の行は通常セッション（anon/authenticated）では見えず、
-- 確認用 SELECT が 0 件でもマイグレーション実行時に 23502 が出ることがある。
-- そのため本マイグレーション内で NULL 行を「最初のユーザー」に割り当ててから NOT NULL を付与する。
--
-- 開発で NULL 行を削除したい場合は、本マイグレーション適用前に、
-- RLS をバイパスする権限（postgres や supabase db execute）で
--   DELETE FROM public.nodes WHERE user_id IS NULL;
-- を実行すること。
--
-- 既に 20260213 を実行して 23502 で失敗済みの場合は、本ファイルの UPDATE と ALTER を
-- RLS をバイパスする権限で手動実行すること（supabase db execute や SQL Editor の postgres）。

DO $$
DECLARE
  first_user_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.nodes WHERE user_id IS NULL) THEN
    SELECT id INTO first_user_id FROM auth.users ORDER BY created_at ASC LIMIT 1;
    IF first_user_id IS NULL THEN
      RAISE EXCEPTION 'nodes に user_id IS NULL の行があるが auth.users が空です。先にユーザーを1人作成するか、DELETE FROM public.nodes WHERE user_id IS NULL を RLS バイパス権限で実行してください。';
    END IF;
    UPDATE public.nodes SET user_id = first_user_id WHERE user_id IS NULL;
  END IF;
END $$;

ALTER TABLE public.nodes
  ALTER COLUMN user_id SET NOT NULL;

COMMENT ON COLUMN public.nodes.user_id IS '所有者（必須）。RLS で auth.uid() = user_id のみアクセス可。';
