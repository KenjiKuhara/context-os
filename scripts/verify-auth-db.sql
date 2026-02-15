-- 認証・RLS 検証用: DB 構造確認（1-1, 1-2, 1-3）
-- 実行: Supabase SQL Editor に貼るか、supabase db execute -f scripts/verify-auth-db.sql

-- 1-1. user_id に NULL が存在しないこと → 期待: null_count = 0
SELECT count(*) AS null_count
FROM public.nodes
WHERE user_id IS NULL;

-- 1-2. user_id が NOT NULL であること → 期待: is_nullable = 'NO'
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'nodes'
  AND column_name = 'user_id';

-- 1-3. RLS が有効であること → 期待: relrowsecurity = true
SELECT relrowsecurity
FROM pg_class
WHERE relname = 'nodes';
