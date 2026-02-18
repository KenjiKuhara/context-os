# 146 — 並行開発時のルール（仕様書・目次の更新）

大規模・並行開発で「誰が何を更新するか」を揃えるためのルール。新規作成・変更時にこのドキュメントに従い、仕様書と実装のずれを防ぐ。

---

## 1. ドキュメントの追加・更新

### 1.1 新規ドキュメントを追加したとき

- **必ず [142_docs_index.md](142_docs_index.md) を更新する。**
  - 「2. 困ったときの逆引き」に該当する場合は、知りたいことと参照 doc を 1 行追加する。
  - 「3. 主要ドキュメント一覧」に、番号とタイトルを 1 行追加する。
- 命名は [00_naming_convention.md](00_naming_convention.md) に従う（`{連番}_{英語スネークケース}.md`、半角英数字とアンダースコアのみ）。

### 1.2 API を追加・変更・削除したとき

- **実装ベースの一覧は [139_api_routes_index.md](139_api_routes_index.md) を更新する。**
  - メソッド・パス・認証種別・用途を表に追加または修正する。
- 設計・契約としての API は [09_API_Contract.md](09_API_Contract.md) に記載する。実パスは 139 を正とする（09 は意図・入出力の参照用）。

### 1.3 テーブル・RLS を追加・変更したとき

- **マイグレーション**を `supabase/migrations/` に追加する（ファイル名の日付で順序を管理）。
- **[141_data_model_overview.md](141_data_model_overview.md)** の「主要テーブルと役割」「RLS 方針の要約」を更新する。所有者の決め方や特例（run_history 等）を忘れずに追記する。

### 1.4 画面・コンポーネントを追加・変更したとき

- **[147_front_structure.md](147_front_structure.md)** のページ一覧・コンポーネント一覧・「ページと API の対応」を必要に応じて更新する。並行で UI を触るときの衝突を減らすため。

### 1.5 環境変数を追加したとき

- **[140_local_dev_setup.md](140_local_dev_setup.md)** の「3. 環境変数」に変数名・必須/任意・説明を追加する。
- 実装では `process.env.*` を参照している箇所と 140 の一覧を一致させる（grep で確認推奨）。

---

## 2. 実装と仕様書の整合

- **状態（ステータス）を触る場合**: [05_State_Machine.md](05_State_Machine.md) と `src/lib/stateMachine.ts` の両方を参照する。遷移ルールは両者で一致させる。
- **API の実パス**: 常に [139_api_routes_index.md](139_api_routes_index.md) を正とする。09 は設計・契約用。
- **環境変数の正式一覧**: [140_local_dev_setup.md](140_local_dev_setup.md) に記載し、実装（`src` および `src/app/api` の `process.env` 参照）と同期する。

---

## 3. 目次の更新責任

- **142** の「主要ドキュメント一覧」と「困ったときの逆引き」は、doc の追加・削除・役割変更に合わせて都度更新する。
- 並行開発時は、PR で doc を追加した人が 142 の該当箇所も一緒に更新する。

---

## 4. 関連ドキュメント

- ドキュメントインデックス: [142_docs_index.md](142_docs_index.md)
- API 一覧: [139_api_routes_index.md](139_api_routes_index.md)
- データモデル: [141_data_model_overview.md](141_data_model_overview.md)
- フロント構成（ページ・コンポーネント・API）: [147_front_structure.md](147_front_structure.md)
- ローカル環境: [140_local_dev_setup.md](140_local_dev_setup.md)
