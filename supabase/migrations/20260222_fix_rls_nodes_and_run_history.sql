-- Security Advisor 対応: nodes と run_history の RLS ポリシー修正
--
-- 問題1: nodes_select_only が USING (true) のため、未認証ユーザーが全ノードを読める
-- 問題2: run_history_select_own_or_job が rule_id IS NULL 行を匿名公開している
--
-- 根拠:
--   10_Architecture.md §2.4 — App Server がビジネスルールの唯一の実行場所
--   API Routes は service_role を使用するため RLS の影響を受けない
--   ブラウザクライアントは Cookie セッション (Supabase SSR) で認証済みアクセスのみを想定

-- ─── 1. nodes: SELECT を自分のノードのみに限定 ──────────────────────────────
-- 旧ポリシー: USING (true) → 未認証ユーザーが全ノードを読める（脆弱性）
-- 新ポリシー: auth.uid() = user_id → 認証済みかつ自分のノードのみ

DROP POLICY IF EXISTS "nodes_select_only" ON public.nodes;

CREATE POLICY "nodes_select_own"
  ON public.nodes
  FOR SELECT
  USING (auth.uid() = user_id);

-- ─── 2. run_history: SELECT を認証済みユーザーのみに限定 ────────────────────
-- 旧ポリシー: rule_id IS NULL の行が匿名アクセス可（Cronジョブ実行記録が漏洩）
-- 新ポリシー: 認証必須 + 自分のルールの履歴 or ジョブ実行レコード（rule_id NULL）

DROP POLICY IF EXISTS "run_history_select_own_or_job" ON public.run_history;

CREATE POLICY "run_history_select_own_or_job"
  ON public.run_history
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      rule_id IS NULL
      OR rule_id IN (SELECT id FROM public.recurring_rules WHERE user_id = auth.uid())
    )
  );
