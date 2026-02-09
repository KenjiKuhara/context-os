-- RLS / Policy 設計
--
-- 方針:
--   context-os は個人利用前提（01_PRD §2, 15_Dev_Plan §1.2）。
--   Next.js API Routes は service_role key でアクセスする（src/lib/supabase.ts）。
--   service_role は RLS をバイパスするため、API からの操作は制限を受けない。
--   RLS の目的は「クライアント（anon key）からの直接アクセスを禁止する」こと。
--
-- 根拠:
--   10_Architecture.md §2.4 — App Server がビジネスルールの唯一の実行場所
--   23_Human_Confirmation_Model.md §2 — confirmation_events は App 経由でのみ操作
--   18_Skill_Governance.md §3 — source + confirmation の二層ガードは App が担保

-- ═══════════════════════════════════════════════════
-- 1) confirmation_events — クライアント直アクセス完全禁止
-- ═══════════════════════════════════════════════════

ALTER TABLE confirmation_events ENABLE ROW LEVEL SECURITY;

-- anon / authenticated ロールからは一切アクセスできない。
-- service_role は RLS をバイパスするため、API Routes からは通常通り操作可能。
-- Policy を 1 つも作らないことで「全拒否」を実現する。

COMMENT ON TABLE confirmation_events IS
  'Human Confirmation SSOT (23 §2). RLS 有効。クライアント直アクセス禁止。service_role のみ操作可。';

-- ═══════════════════════════════════════════════════
-- 2) node_status_history — 読み取りのみ許可（最小権限）
-- ═══════════════════════════════════════════════════

ALTER TABLE node_status_history ENABLE ROW LEVEL SECURITY;

-- anon / authenticated は SELECT のみ許可。
-- INSERT / UPDATE / DELETE は service_role 経由（API Routes）でのみ実行。
CREATE POLICY "history_select_only"
  ON node_status_history
  FOR SELECT
  USING (true);

COMMENT ON TABLE node_status_history IS
  'Status history + audit log. RLS 有効。読み取りは公開、書き込みは service_role のみ。';

-- ═══════════════════════════════════════════════════
-- 3) nodes — 既存テーブルも同じ方針で保護
-- ═══════════════════════════════════════════════════

ALTER TABLE nodes ENABLE ROW LEVEL SECURITY;

-- 読み取りは許可（ダッシュボード等）。書き込みは API 経由のみ。
CREATE POLICY "nodes_select_only"
  ON nodes
  FOR SELECT
  USING (true);

COMMENT ON TABLE nodes IS
  'Node (04_Domain_Model). RLS 有効。読み取りは公開、書き込みは service_role のみ。';
