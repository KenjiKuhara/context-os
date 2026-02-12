# 84 — Phase7-B スコープ（案）

Phase7-A 完了後の次の一歩として **Phase7-B** の目的と候補テーマを整理する。**DB 変更なしで進められるテーマを優先**し、MVP として最初にやるテーマを 1 つ仮決定する。

**前提**: 82_phase7_a_history_closeout.md、76_phase7_scope.md。Phase7-A で履歴 API・履歴 UI・Apply 後のリロード不要更新まで実装済み。

---

## 1. Phase7-B の目的

- **Phase7-A で実現した「履歴の可視化」をさらに使いやすくする**、または **意思決定を辿れる OS の価値を一段上げる** ことを目的とする。
- Phase7-A では API で type / node_id フィルタに対応したが UI は未実装。履歴とツリーの連携・reason 表示・ページネーションも未対応である。

---

## 2. 候補テーマの整理

**重要**: DB 変更（スキーマ変更・新規テーブル・マイグレーション）が不要なテーマを優先する。

### 2.1 DB 変更なしで進められる候補（優先）

| 候補 | 内容 | 理由 |
|------|------|------|
| **A. 履歴の type / node_id フィルタ UI** | Organizer タブの履歴ブロックに、種別（relation/grouping/decomposition）と node_id で絞り込む UI を追加する。GET /api/confirmations/history?type=...&node_id=... は既に実装済み。 | API 対応済みのためフロントのみの変更で完結。DB 変更なし。78 Step5/6 で計画済み。 |
| **B. 履歴とツリーの連携** | 履歴の 1 件を選んだときに、該当 Node をダッシュボードのツリーまたは詳細パネルで表示する。ProposalPanel と Dashboard の連携（state の持ち方）を設計する必要あり。 | 既存 nodes / node_id を参照するだけ。DB 変更なし。 |
| **C. 履歴のページネーション UI** | 「さらに読み込む」ボタンや offset 指定で、50 件超の履歴を表示する。API の limit/offset は対応済み。 | フロントのみ。DB 変更なし。 |

### 2.2 DB 変更が不要または最小限の候補（次点）

| 候補 | 内容 | 備考 |
|------|------|------|
| **D. reason の保存・表示** | Confirm 時に Organizer の proposal.reason を proposed_change に含めて保存する。履歴詳細で reason を表示する。confirmation_events の proposed_change は JSONB のため、キーを足すだけならスキーマ変更なし。 | 既存 confirmation 発行フロー（ProposalPanel）と API の拡張のみ。DB スキーマ変更は不要。 |

### 2.3 DB 変更または設計が重い候補（優先度を下げて併記）

| 候補 | 内容 | 備考 |
|------|------|------|
| **E. 判断ログの専用保存** | 「誰がなぜこの変更を採用したか」を人間が入力し、別テーブルや専用カラムで保存する。 | 新規テーブルまたは confirmation_events 以外の永続化が必要な場合は DB 変更。76 の候補 B。 |
| **F. Undo（安全な巻き戻し）** | 適用済み Diff を 1 件取り消す。decomposition の場合は子ノード削除＋node_children 削除等。 | 整合性・トランザクション・UI 設計が重い。76 の候補 C。 |
| **G. トレーとツリーの統合表示** | トレー（実施中・判断待ち等）とツリーを一つの視点で表示する。 | 主に UI/表示層。DB 変更は不要だがスコープが大きい。76 の候補 D。 |

---

## 3. Phase7-B の第一テーマ（仮決定）

**Phase7-B の最初のテーマは「履歴の type / node_id フィルタ UI」とする（上記 A）。**

### 仮決定の理由

| 観点 | 内容 |
|------|------|
| **DB 変更なし** | 既存 GET /api/confirmations/history のクエリをそのまま利用するだけ。フロントのみの変更で完結する。 |
| **実装コストが小さい** | 78 Step5/6 で手順が整理済み。ProposalPanel にフィルタ用の state と UI（種別ドロップダウン・node_id 入力欄等）を追加し、履歴取得時にクエリを付与する。 |
| **価値が明確** | 履歴が増えたときに「relation だけ見たい」「この Node に関係する履歴だけ見たい」というニーズに答えられる。Phase7-A の履歴可視化の完成度が上がる。 |
| **既存を壊さない** | 履歴表示・Apply フロー・Phase6 ツリーには手を入れない。 |

### やること（MVP イメージ）

- Organizer タブの「適用済み Diff 履歴」ブロックの上部に、種別フィルタ（すべて / relation / grouping / decomposition）と node_id 入力欄（任意）を追加する。
- フィルタ変更時または node_id 入力時に、GET /api/confirmations/history?type=...&node_id=... を再呼び出し、表示を更新する。
- 詳細な実装計画・DoD は別 doc（85 以降）で行う。

### やらないこと（Phase7-B の第一テーマの範囲外）

- reason の保存・表示。
- 履歴とツリーの連携。
- ページネーション UI。
- Undo・判断ログ専用保存・トレーとツリーの統合表示。

---

## 4. 参照ドキュメント

| 番号 | ファイル名 |
|------|------------|
| 76 | 76_phase7_scope.md |
| 78 | 78_phase7_history_mvp_plan.md（Step5/6） |
| 82 | 82_phase7_a_history_closeout.md |

---

以上。Phase7-B のスコープ案と第一テーマ（履歴の type / node_id フィルタ UI）の仮決定を記載した。
