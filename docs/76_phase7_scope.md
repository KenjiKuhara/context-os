# 76 — Phase7 スコープ

Phase7 のテーマを定義する。本ドキュメントは Phase7 の目的・候補テーマ・第一テーマ・MVP スコープ・Definition of Done を定める。

**前提**: 75_phase6_summary.md、23_Human_Confirmation_Model.md、51_phase5_diff_schema.md。Phase6 までで構造（tree）、差分（diff）、変更の確定（confirm）、UI 操作、状態の永続化は実装済みである。

---

## 1. Phase7 の位置づけ

### Phase6 までの到達点

| 領域 | 到達点 |
|------|--------|
| **構造** | nodes.parent_id + node_children による親子関係。decomposition による Diff Apply。 |
| **差分** | relation / grouping / decomposition の Diff。Organizer から提案 → Confirm → Apply。 |
| **変更の確定** | confirmation_events への発行・消費。1 confirmation = 1 変更。二重適用防止。 |
| **UI 操作** | ツリー表示、開閉、キーボードナビ、詳細パネル連携。フラット／ツリー切替。 |
| **状態の永続化** | ツリー開閉状態の localStorage 保存・復元。 |

### ここから何を強化するフェーズか

Phase7 は **UI の見た目や操作性の強化ではなく、「OS の本質」を進めるフェーズ** である。

context-os の価値は「思考の途中を保存し、再開できる外部ワーキングメモリ」にある（00_Vision_NorthStar.md）。その価値を一段引き上げるには、

- **「なぜこの構造になったか」を辿れる**
- **「いつ・何を・誰が決定したか」を確認できる**

という「意思決定の可視化・追跡」が欠けている。Phase6 では Apply した直後は Organizer の Diff 表示で確認できるが、**過去に適用した Diff や confirmation の履歴を一覧・ツリーで見る UI はない**。confirmation_events と node_status_history にはデータは残っているが、それを「判断ログ」としてまとめて見る層は未実装である（43_phase4_done_summary.md、44_phase5_route_options.md）。

### 方針

Phase7 では **「OS としての価値を一段引き上げるテーマ」** を選定し、MVP 前提でスコープを小さく保つ。UI 強化ではなく、**「意思決定を辿れる OS」への発展** を本質とする。

---

## 2. 候補テーマの整理（比較表）

以下の 5 候補を表形式で整理する。

| 候補 | 何を解決するか | OS としての意味 | 実装難易度 | MVP に向くか |
|------|----------------|-----------------|------------|---------------|
| **A. Diff / Confirmation 履歴の可視化** | 過去に適用した Diff や confirmation の履歴を一覧・ツリーで見れない。Organizer の Apply 直後以外は「何がいつ適用されたか」が分からない。 | 「この構造はなぜこうなったか」を後から追跡できる。監査・振り返り・思考の再開の文脈を維持できる。 | 低 | ◎ |
| **B. 判断ログ（なぜこの変更をしたか）の保存・参照** | reason の記録は proposal の reason で済むが、「誰がなぜこの変更を採用したか」の人間の理由を記録する仕組みがない。 | 人間の意思決定理由を追跡。AI の提案と人間の判断のギャップを明示できる。 | 中 | △ |
| **C. Undo（安全な巻き戻し）** | 誤適用した Diff を戻すには手動で削除するしかない。 | 安心して Apply できる。取り消し可能な OS としての信頼性。 | 高 | × |
| **D. トレーとツリーの統合表示** | トレー（実施中・判断待ち等）とツリーは別の切り口で、横断表示やナビがない。 | 状態と構造を一つの視点で見られる。 | 中 | △ |
| **E. 判断温度（temperature）の可視化強化** | 温度は 06_Temperature_Spec.md で定義されているが、UI での可視化が弱い。 | 関心・活性度を「見える化」し、再提示の優先度を判断しやすくする。 | 低 | △ |

### 補足

- **A**: confirmation_events と node_status_history に既にデータがある。新規 API と UI で「読み取り」を足すだけ。DB 変更なし。
- **B**: confirmation 発行時に reason を人間が入力する UI を追加する必要がある。既存 confirmation の拡張で対応可能。
- **C**: decomposition の Undo は子ノード削除 + node_children 削除。relation / grouping の Undo は relations / group_members の削除。整合性・トランザクション・UI の設計が重い。
- **D**: トレー表示とツリー表示の統合は、Phase6 の UI 拡張であり、OS の本質とは少しずれる。
- **E**: 温度は既存の nodes.temperature を参照する。表示強化であれば難易度は低いが、OS の価値向上としては A より控えめ。

---

## 3. Phase7 の第一テーマ（仮決定）

**Phase7 の最初のテーマは「Diff / Confirmation 履歴の可視化」とする。**

### 仮決定の理由

| 原則 | 該当 |
|------|------|
| **DB 大改造を伴わない** | confirmation_events と node_status_history に既にデータがある。新規テーブルは不要。読み取り用 API のみ追加。 |
| **既存の confirmation / diff 構造を活かせる** | proposed_change に type / diff_id / target_node_id 等が含まれる。consumed な confirmation を一覧・絞り込みで取得する。 |
| **OS の価値が明確に上がる** | 「意思決定を辿れる OS」への第一歩。Phase6 のツリーと組み合わせ、「なぜこの構造になったか」を追跡できる。 |
| **実装難易度が低い** | 読み取り・表示のみ。Apply は触らない。 |
| **MVP に向く** | スコープを「履歴一覧の表示」に絞れば、1 フェーズで完了可能。 |

### 前提となる事実

- confirmation_events には confirmation_id, node_id, proposed_change, consumed, consumed_at, confirmed_at 等が保存されている（23_Human_Confirmation_Model.md、55_phase5_relation_diff_apply_implementation.md 等）。
- node_status_history には status 変更の履歴が confirmation_id と紐づいて記録されている（17_Skill_EstimateStatus.md、25_Smoke_Test.md）。
- 既存の relation / grouping / decomposition の Apply は confirmation を consumed に更新する。consumed な confirmation を一覧すれば「適用済みの Diff」の履歴が得られる。

---

## 4. MVP のスコープ

### やること

| 項目 | 内容 |
|------|------|
| **履歴 API** | consumed な confirmation_events を取得する API（GET /api/confirmations/history または類似）。ページネーション・フィルタ（node_id 単位・日時範囲・type 種別）は MVP では最小限とする。 |
| **履歴 UI** | Organizer タブまたは Dashboard に「適用済み Diff 履歴」ブロックを追加。一覧表示（日時、type、node_id / target_node_id、reason の要約）。クリックで詳細を表示。 |
| **詳細連携** | 履歴の 1 件を選んだとき、該当 Node をツリーまたは詳細パネルで表示できる（オプション）。 |

### やらないこと

| 項目 | 内容 |
|------|------|
| **サーバ保存の拡張** | confirmation_events のスキーマ変更は行わない。既存のカラムで足りる。 |
| **判断理由の追加入力** | 人間が「なぜ採用したか」の reason を追加で入力する UI は行わない。proposal の reason をそのまま表示する。 |
| **Undo** | 履歴から「取り消す」操作は行わない。表示のみ。 |
| **検索・フィルタの高度化** | 全文検索・複合条件は MVP の範囲外。必要最小限の絞り込みのみ。 |
| **履歴のエクスポート** | CSV 出力等は行わない。 |
| **ツリーとの統合表示** | 履歴の 1 件を選んだときにツリー上で該当 Node をハイライトするなどは、MVP で実装可能な範囲で検討する。必須ではない。 |

### 変更が見込まれるファイル種別

| 種別 | 変更内容 |
|------|----------|
| **API** | 新規: GET /api/confirmations/history（または類似）。confirmation_events から consumed なものを取得。 |
| **UI** | ProposalPanel または Dashboard に「適用済み Diff 履歴」ブロックを追加。一覧コンポーネント。 |
| **md** | 本ドキュメントに続き、計画 doc（77_phase7_history_plan.md 等）、実装手順 doc、E2E 結果 doc、closeout doc を新規作成する（71_md_operation_policy.md に従う）。 |

---

## 5. Definition of Done

手動で確認できるチェック項目を以下とする。

| # | 確認項目 |
|---|----------|
| 1 | 履歴 API を呼び出すと、consumed な confirmation を一覧で取得できる（relation / grouping / decomposition のいずれかを含む）。 |
| 2 | 履歴 UI のブロックで、適用済み Diff が日時・type・対象 node・reason の要約とともに表示される。 |
| 3 | 履歴の 1 件をクリックすると、その Diff の詳細（proposed_change の内容等）が表示される。 |
| 4 | フィルタ（type 種別・日時範囲・node_id 単位のいずれか）が動作し、結果が絞り込まれる。 |
| 5 | 履歴表示が Organizer タブの relation / grouping / decomposition の Diff Apply フローを壊していない。 |
| 6 | 空の履歴（Apply がまだ一度もない場合）でもエラーにならず、適切なメッセージが表示される。 |
| 7 | Phase6 のツリー表示・開閉・キーボードナビ・詳細パネル連携が壊れていない。 |

---

## 6. Phase7 が完成したときの姿

**この OS は何が他と違うのか？**

> **「なぜこの構造になったか」を後から辿れる**。  
> 一般的なタスク管理ツールは「今の状態」と「将来の ToDo」しか見えない。context-os は、**人間がいつ・どの Diff を採用したか** を履歴として一覧し、思考の文脈を維持したまま再開できる。**意思決定を辿れる OS** として、他ツールとの差別化になる。

---

以上。Phase7 のスコープを定義した。第一テーマ「Diff / Confirmation 履歴の可視化」の詳細計画は 77 以降の doc で行う。
