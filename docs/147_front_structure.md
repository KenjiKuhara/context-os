# 147 — フロント構成（ページ・コンポーネント・API 対応）

実装から逆引きした、画面とコンポーネント・API の対応。並行で UI を触るときの影響範囲の把握と衝突防止用。変更時は [146_parallel_dev_rules.md](146_parallel_dev_rules.md) に従い本ドキュメントを更新する。

---

## 1. ページ一覧

| ルート | ファイル | 役割 |
|--------|----------|------|
| / | (app/page.tsx) | トップ（未使用またはリダイレクト想定） |
| /login | src/app/login/page.tsx | ログイン（メール・パスワード）。認証済みは /dashboard へ。パスワードリセットフォームも内包。 |
| /auth/reset-password | src/app/auth/reset-password/page.tsx | パスワードリセット完了（PKCE / implicit フロー対応）。新パスワード入力後 /dashboard へ。 |
| /dashboard | src/app/dashboard/page.tsx | メインダッシュボード（進行中タスク一覧・ツリー・提案パネル・クイック追加・ステータス切替）。 |
| /dashboard/recurring | src/app/dashboard/recurring/page.tsx | 繰り返しタスク（ルール一覧・追加・編集・削除・今すぐ実行・実行履歴クリア・診断・実行ログ）。 |

---

## 2. コンポーネント一覧

| コンポーネント | ファイル | 主な使用先 |
|----------------|----------|------------|
| ProposalPanel | src/components/ProposalPanel.tsx | ダッシュボード（提案・履歴・ステータス推定 UI） |
| TreeList | src/components/TreeList.tsx | ダッシュボード（ツリー D&D 表示） |
| ThemeSwitcher | src/components/ThemeSwitcher.tsx | ダッシュボード、繰り返しページ |
| QuickAdd | src/components/QuickAdd.tsx | ダッシュボード |
| StatusQuickSwitch | src/components/StatusQuickSwitch.tsx | ダッシュボード |
| ThemeRestore | src/components/ThemeRestore.tsx | ルート layout（テーマ復元） |
| FaviconUpdater | src/components/FaviconUpdater.tsx | ルート layout（ファビコン更新） |

---

## 3. ページと API の対応

### 3.1 /dashboard（メインダッシュボード）

| 用途 | API |
|------|-----|
| トレイ・ノード・子関係の取得 | GET /api/dashboard |
| ノード作成 | POST /api/nodes |
| ノード更新 | PATCH /api/nodes/[id] |
| ステータス変更（推定） | POST /api/nodes/[id]/estimate-status |
| ステータス一括カスケード | POST /api/nodes/[id]/status-cascade |
| ノード履歴取得 | GET /api/nodes/[id]/history |
| ノードのリンク一覧・追加 | GET /api/nodes/[id]/links, POST /api/nodes/[id]/links |
| 確認イベント送信 | POST /api/confirmations |
| ツリー移動（D&D） | POST /api/tree/move |

### 3.2 /dashboard/recurring（繰り返しタスク）

| 用途 | API |
|------|-----|
| ルール一覧取得 | GET /api/recurring |
| ルール作成 | POST /api/recurring |
| ルール更新・削除 | PATCH /api/recurring/[id], DELETE /api/recurring/[id] |
| 実行履歴取得 | GET /api/recurring/history |
| 今すぐ実行 | POST /api/recurring/run-now |
| 実行履歴クリア | POST /api/recurring/[id]/clear |

### 3.3 /login

- 認証は Supabase Auth（createClient().auth.signInWithPassword 等）。API は直接呼ばない。認証済み時のリダイレクト先は /dashboard。

---

## 4. 関連ドキュメント

- 並行開発ルール（本 doc の更新ルール）: [146_parallel_dev_rules.md](146_parallel_dev_rules.md)
- API 一覧: [139_api_routes_index.md](139_api_routes_index.md)
- 繰り返し仕様: [135_recurring_cron_setup.md](135_recurring_cron_setup.md)、[137_recurring_run_history_and_operations.md](137_recurring_run_history_and_operations.md)
