# 142 — ドキュメントインデックス

docs 内の主なドキュメントを番号帯・用途別に整理。並行開発時に「どこに何が書いてあるか」の逆引き用。**新規 doc を追加したときは、本インデックスの「2. 困ったときの逆引き」と「3. 主要ドキュメント一覧」を更新すること。** 詳細は [146_parallel_dev_rules.md](146_parallel_dev_rules.md) を参照。

---

## 1. 番号帯ごとの役割

| 番号帯 | 内容 |
|--------|------|
| 00〜20 | 共通ルール・アーキテクチャ・API 契約 |
| 20〜40 | Observer・Agent・品質・運用テスト |
| 40〜90 | Phase 別（diff・履歴・フィルタ・ツリー・グループ等）の設計・E2E・クローズアウト |
| 90〜130 | Phase 続き（理由・復元・ステータス・クイック追加・ダーク等） |
| 130〜 | 運用・トラブルシュート・API 一覧・環境・データモデル・本インデックス |

---

## 2. 困ったときの逆引き

| 知りたいこと・現象 | 参照ドキュメント |
|--------------------|------------------|
| 認証・RLS の検証をしたい | [134_auth_rls_verification_checklist.md](134_auth_rls_verification_checklist.md) |
| 繰り返しタスクの自動実行を設定したい | [135_recurring_cron_setup.md](135_recurring_cron_setup.md) |
| 実行履歴・二重防止・クリア・診断 | [137_recurring_run_history_and_operations.md](137_recurring_run_history_and_operations.md) |
| Cron が動かない | [138_vercel_cron_troubleshooting.md](138_vercel_cron_troubleshooting.md) |
| Push してもデプロイされない | [136_vercel_push_deploy_checklist.md](136_vercel_push_deploy_checklist.md) |
| API の一覧（実装ベース） | [139_api_routes_index.md](139_api_routes_index.md) |
| ローカル環境のセットアップ | [140_local_dev_setup.md](140_local_dev_setup.md) |
| テーブル・RLS の概要 | [141_data_model_overview.md](141_data_model_overview.md) |
| ドキュメントの命名規則 | [00_naming_convention.md](00_naming_convention.md) |
| 全体アーキテクチャ・責務分離 | [10_Architecture.md](10_Architecture.md) |
| API 設計・契約 | [09_API_Contract.md](09_API_Contract.md) |
| Observer の仕様・運用 | [26_Agent_Observer_MVP.md](26_Agent_Observer_MVP.md) 等 |
| 並行開発時の更新ルール（doc/API/DB の更新） | [146_parallel_dev_rules.md](146_parallel_dev_rules.md) |
| 画面・コンポーネント・API の対応 | [147_front_structure.md](147_front_structure.md) |
| ステータス・遷移を触る（設計と実装の対応） | [05_State_Machine.md](05_State_Machine.md) と src/lib/stateMachine.ts |

---

## 3. 主要ドキュメント一覧（抜粋）

- **00** — 命名規則  
- **09** — API Contract  
- **10** — Architecture  
- **26** — Agent Observer MVP  
- **134** — 認証・RLS 検証チェックリスト  
- **135** — 繰り返し Cron 設定  
- **136** — Push でデプロイされないとき  
- **137** — 繰り返し実行履歴と運用  
- **138** — Vercel Cron トラブルシュート  
- **139** — API ルート一覧  
- **140** — ローカル開発セットアップ  
- **141** — データモデル概要  
- **142** — 本インデックス  
- **143** — プロダクト（Steering）  
- **144** — 技術スタック（Steering）  
- **145** — リポジトリ構成（Steering）  
- **146** — 並行開発ルール（仕様書・目次の更新）  
- **147** — フロント構成（ページ・コンポーネント・API 対応）  

Phase 別の design / e2e / closeout は 50〜130 番台に多数ある。一覧は `docs/` ディレクトリのファイル名で確認可能。
