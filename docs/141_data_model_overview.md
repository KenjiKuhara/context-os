# 141 — データモデル概要

並行開発時の「どのテーブルを触るか」の参照用。詳細は `supabase/migrations/*.sql` を参照。

---

## 1. 主要テーブルと役割

| テーブル | 役割 | 所有者の決め方 |
|----------|------|----------------|
| nodes | 中核エンティティ。title, context, status, due_date 等。 | user_id = auth.uid() |
| node_children | 明示的な親子関係（parent_id より優先）。 | parent / child が自分の nodes を参照 |
| node_links | ノード間の相互参照。 | node_id が自分の nodes を参照 |
| relations | 意味付き関係（from_node_id, to_node_id）。 | 両端が自分の nodes |
| groups | 名前付きグループ。 | group_members → nodes で user_id 判定 |
| group_members | グループとノードの多対多。 | node_id が自分の nodes |
| recurring_rules | 繰り返しタスクのルール。 | user_id = auth.uid() |
| run_history | 繰り返し実行履歴（ルール単位＋ジョブ単位）。 | 自分の rule_id または rule_id NULL（ジョブ） |
| node_status_history | ステータス変更の監査。 | node_id が自分の nodes |
| confirmation_events | ユーザー操作イベント。 | node_id が自分の nodes |
| observer_reports | Observer 実行結果。 | 認証済みなら SELECT 可（全ユーザー分は service_role 想定） |

---

## 2. RLS 方針の要約

- **user_id を持つテーブル（nodes, recurring_rules）**: `auth.uid() = user_id` で CRUD を制限。
- **ノードに紐づくテーブル（node_children, node_links, relations, node_status_history, confirmation_events）**: 対象ノードが自分の nodes に属するかで判定（JOIN nodes WHERE n.user_id = auth.uid()）。
- **groups / group_members**: group_members の node_id が自分の nodes かで判定。
- **run_history**: SELECT は「rule_id が自分の recurring_rules」または「rule_id IS NULL（ジョブ実行）」のみ。INSERT は自分のルールに対する manual/clear のみ。cron およびジョブ実行レコードは service_role で insert。
- **observer_reports**: 認証済みユーザーが SELECT 可能。insert は API 経由（OBSERVER_TOKEN）。

API ルートの多くは service_role を使わず、セッション（getSupabaseAndUser）で anon/authenticated クライアントを使うため、RLS がそのまま適用される。繰り返しジョブ（/api/recurring/run）だけ service_role で全ユーザーのルールを処理する。

---

## 3. 関連ドキュメント

- 認証・RLS 検証: [134_auth_rls_verification_checklist.md](134_auth_rls_verification_checklist.md)
- 繰り返し・run_history: [137_recurring_run_history_and_operations.md](137_recurring_run_history_and_operations.md)
- 全体アーキテクチャ: [10_Architecture.md](10_Architecture.md)
