# 139 — API ルート一覧（実装ベース）

並行開発時の「どの API を触るか」の参照用。設計・契約は [09_API_Contract.md](09_API_Contract.md) を参照。

- **ベース URL**: ローカルは `http://localhost:3000`、本番は Vercel のドメイン。
- **認証**: 「セッション」＝ Supabase セッション（Cookie）。未ログイン時は 401。

---

## 認証種別の凡例

| 略称 | 説明 |
|------|------|
| セッション | `getSupabaseAndUser()`。ログイン必須。 |
| CRON_SECRET | `Authorization: Bearer <CRON_SECRET>`。Vercel Cron 用。 |
| OBSERVER_TOKEN | `Authorization: Bearer <OBSERVER_TOKEN>`。Observer（Python）・CI 用。 |
| セッション or OBSERVER | どちらか一方で可（例: ダッシュボード or スモーク）。 |

---

## 一覧（パス順）

| メソッド | パス | 認証 | 用途 |
|----------|------|------|------|
| GET | /api/confirmations/history | セッション | 確認イベント履歴取得 |
| POST | /api/confirmations | セッション | 確認イベント送信 |
| GET | /api/dashboard | セッション or OBSERVER_TOKEN | ダッシュボード用データ取得（Observer は Bearer で取得可） |
| POST | /api/diffs/decomposition/apply | セッション | AI 提案の分解を適用 |
| POST | /api/diffs/grouping/apply | セッション | AI 提案のグループ化を適用 |
| POST | /api/diffs/relation/apply | セッション | AI 提案の関係を適用 |
| GET | /api/e2e-verify/decomposition | セッション | E2E 用・分解検証 |
| GET | /api/e2e-verify/groups | セッション | E2E 用・グループ検証 |
| PATCH | /api/links/[linkId] | セッション | リンク更新 |
| DELETE | /api/links/[linkId] | セッション | リンク削除 |
| GET | /api/nodes | セッション | ノード一覧取得 |
| POST | /api/nodes | セッション | ノード作成（Capture） |
| PATCH | /api/nodes/[id] | セッション | ノード更新 |
| GET | /api/nodes/[id]/history | セッション | ノードのステータス履歴 |
| POST | /api/nodes/[id]/estimate-status | セッション | ステータス推定（AI） |
| GET | /api/nodes/[id]/links | セッション | ノードのリンク一覧 |
| POST | /api/nodes/[id]/links | セッション | ノードにリンク追加 |
| PATCH | /api/nodes/[id]/status | セッション | ステータス変更（stateMachine 経由） |
| POST | /api/nodes/[id]/status-cascade | セッション | ステータス一括カスケード |
| POST | /api/tree/move | セッション | ツリー D&D でノード移動 |
| POST | /api/organizer/run | セッション | Organizer（構造提案）実行 |
| POST | /api/advisor/run | セッション | Advisor 実行 |
| POST | /api/observer/run | — | 未実装（501）。Observer は外部実行し POST /api/observer/reports に送信。 |
| GET | /api/observer/reports/latest | セッション or OBSERVER_TOKEN | 直近 Observer レポート取得 |
| POST | /api/observer/reports | OBSERVER_TOKEN | Observer レポート送信（Python/CI から） |
| POST | /api/proposal-quality/validate | セッション | 提案品質検証 |
| GET | /api/recurring | セッション | 繰り返しルール一覧 |
| POST | /api/recurring | セッション | 繰り返しルール作成 |
| GET | /api/recurring/history | セッション | 実行履歴（run_history）取得 |
| POST | /api/recurring/run-now | セッション | 今すぐ実行（画面用） |
| GET | /api/recurring/run | CRON_SECRET | 定期ジョブ（Vercel Cron）。POST も可。 |
| POST | /api/recurring/run | CRON_SECRET | 同上 |
| PATCH | /api/recurring/[id] | セッション | 繰り返しルール更新 |
| DELETE | /api/recurring/[id] | セッション | 繰り返しルール削除 |
| POST | /api/recurring/[id]/clear | セッション | 実行履歴クリア（last_run_* リセット・next_run_at を今日に） |

---

## 関連ドキュメント

- 繰り返し・Cron: [135_recurring_cron_setup.md](135_recurring_cron_setup.md)、[137_recurring_run_history_and_operations.md](137_recurring_run_history_and_operations.md)、[138_vercel_cron_troubleshooting.md](138_vercel_cron_troubleshooting.md)
- Observer: [26_Agent_Observer_MVP.md](26_Agent_Observer_MVP.md) 等
- 認証・RLS: [134_auth_rls_verification_checklist.md](134_auth_rls_verification_checklist.md)
