# 77 — Phase7-A Diff / Confirmation 履歴 設計

Phase7-A「Diff / Confirmation 履歴の可視化」を実装前に設計レベルで具体化する。

**前提**: 76_phase7_scope.md（スコープ定義）、51_phase5_diff_schema.md、23_Human_Confirmation_Model.md、55_phase5_relation_diff_apply_implementation.md 等。

---

## 1. 現在存在する履歴データの整理（事実）

### 1.1 confirmation_events テーブル

**スキーマ**: 20260208_create_confirmation_events.sql により定義。

| カラム | 型 | 説明 |
|--------|-----|------|
| confirmation_id | UUID | 主キー。承認の一意 ID。 |
| node_id | UUID | 対象 Node の ID。NOT NULL。 |
| confirmed_by | TEXT | 承認者の種別。MVP では常に "human"。 |
| confirmed_at | TIMESTAMPTZ | 承認日時。 |
| ui_action | TEXT | 承認操作の識別子（例: "organizer_relation_apply"）。 |
| proposed_change | JSONB | 承認された変更内容。type ごとに構造が異なる。 |
| consumed | BOOLEAN | Apply に使用済みか。デフォルト FALSE。 |
| consumed_at | TIMESTAMPTZ | 使用された日時。未使用なら NULL。 |
| expires_at | TIMESTAMPTZ | 失効日時（confirmed_at + 24h）。 |
| created_at | TIMESTAMPTZ | レコード作成日時。 |

**インデックス**: node_id + confirmed_at、consumed（未消費検索用）、expires_at。

### 1.2 proposed_change の構造（type 別）

| type | 含まれるフィールド | 備考 |
|------|-------------------|------|
| **relation** | type, diff_id, from_node_id, to_node_id, relation_type | 2 ノード間の関係 1 本追加。 |
| **grouping** | type, diff_id, group_label, node_ids | 複数 Node を 1 グループに。node_ids は 2 件以上。 |
| **decomposition** | type, diff_id, parent_node_id, add_children | 親 Node に子 N 件を作成。add_children は { title, context?, suggested_status? }[]。 |
| **status_change** | type, from, to | status 変更。estimate-status 用。本履歴の対象外とする。 |

### 1.3 既存データで得られる情報

| 項目 | 取得可否 | 取得元 |
|------|----------|--------|
| diff_id | ○ | proposed_change.diff_id |
| node_id | ○ | confirmation_events.node_id |
| consumed | ○ | confirmation_events.consumed |
| consumed_at | ○ | confirmation_events.consumed_at |
| confirmed_at | ○ | confirmation_events.confirmed_at |
| type（relation / grouping / decomposition） | ○ | proposed_change.type |
| 変更内容の詳細 | ○ | proposed_change（type に応じたフィールド） |
| reason（提案理由） | × | **confirmation_events には保存されていない**。Organizer の Diff には reason があるが、Confirm 時に proposed_change に含めて保存していない。 |

### 1.4 relation / grouping / decomposition の違い

| type | 主対象 node_id | 表示に使える情報 |
|------|---------------|------------------|
| relation | from_node_id と一致 | from_node_id → to_node_id、relation_type |
| grouping | node_ids[0]（代表） | group_label、node_ids 件数、node_ids 一覧 |
| decomposition | parent_node_id | parent_node_id、add_children の件数と各 title |

### 1.5 履歴として表示する対象

- **consumed = true** の confirmation のみ。Apply 済みの Diff のみを「履歴」とする。
- status_change は本 Phase7-A の対象外（estimate-status の履歴は別テーマ）。

---

## 2. 履歴とは何を表示するのか？

### 2.1 粒度の候補

| 粒度 | 説明 | 1 行の対応 |
|------|------|------------|
| **1 confirmation = 1 行** | 1 つの承認（Apply）が 1 行。 | confirmation_events の 1 レコード。 |
| **1 diff = 1 行** | 1 つの Diff が 1 行。 | 1 confirmation = 1 diff なので実質同じ。 |
| **1 apply = 1 行** | 1 回の Apply が 1 行。 | 1 confirmation = 1 apply なので実質同じ。 |
| **1 node = 1 行** | 1 つの Node に関する複数 Apply を集約。 | 複数 confirmation を node_id でグルーピング。 |

### 2.2 MVP での決定

**MVP では「1 confirmation = 1 行」とする。**

理由:

- confirmation_events の 1 レコードが 1 行に対応し、実装が単純。
- 1 confirmation = 1 diff = 1 apply である（51_phase5_diff_schema.md、23_Human_Confirmation_Model.md）。粒度の混乱がない。
- node 単位の集約はフィルタで対応する。表示の基本単位は「1 回の Apply」とする。

---

## 3. MVP 表示イメージ（文章で）

### 3.1 形式

- **タイムライン形式** とする。新しいものを上（または左）に、古いものを下（または右）に並べる。
- **全体履歴** を表示する。全 Apply 済み confirmation を 1 つのリストで見る。
- **ノード別履歴** はフィルタで実現する。`node_id` で絞り込んだとき、その Node が主対象（node_id）または関係先（from_node_id / to_node_id / node_ids に含まれる）の confirmation のみ表示する。

### 3.2 配置

- Organizer タブ内に「適用済み Diff 履歴」ブロックを追加する。
- 既存の「適用可能な Diff（relation / grouping / decomposition）」ブロックの下、または別セクションとして配置する。

### 3.3 一覧の 1 行の内容（想定）

- **日時**: consumed_at（Apply された日時）を表示。なければ confirmed_at。
- **種別**: type のラベル（relation / grouping / decomposition を日本語またはアイコンで表現）。
- **対象**: type に応じて「from → to」の要約、「group_label / N 件」、「親 … に子 N 件」など。
- **詳細トリガー**: 行クリックで詳細パネルを展開する。

### 3.4 詳細表示（クリック時）

- proposed_change の構造をそのまま表示する。
- relation: from_node_id、to_node_id、relation_type。
- grouping: group_label、node_ids 一覧。
- decomposition: parent_node_id、add_children の各 title。
- reason は現状 confirmation_events にないため、MVP では表示しない（または「—」とする）。将来、Confirm 時に reason を proposed_change に含めて保存する拡張を検討する。

### 3.5 フィルタ

- **type 種別**: relation / grouping / decomposition のいずれかで絞り込み。複数選択可とするか、MVP では単一選択または「すべて」のみとする。
- **node_id**: 特定 Node に関係する履歴のみ表示。入力欄または Node 選択 UI から指定。
- **日時範囲**: オプション。MVP では「直近 N 件」で十分とする場合、日時フィルタは省略可。

### 3.6 空のとき

- 履歴が 0 件のときは「Apply 済みの Diff はまだありません」などと表示する。エラーにはしない。

---

## 4. MVP API 設計

### 4.1 新規 API が必要か

**新規 API が必要である。** 既存の `POST /api/confirmations` は Confirmation の**発行**用であり、consumed な履歴の**取得**用途には使えない。読み取り専用の履歴 API を新設する。

### 4.2 既存 confirmation API の流用

- `POST /api/confirmations` は発行専用。履歴取得には流用しない。
- 新規 `GET /api/confirmations/history`（または `GET /api/confirmations?consumed=true` のようなクエリ拡張）を用意する。
- パスは `GET /api/confirmations/history` とする。REST 的には `GET /api/confirmations` にクエリ `?consumed=true` を付ける形もあり得るが、読み取り専用・履歴用途であることを明確にするため、`/history` サブパスを採用する。

### 4.3 レスポンス形式

- **配列** で返す。各要素は 1 つの confirmation を示す。
- 含めるフィールド: confirmation_id, node_id, confirmed_at, consumed_at, proposed_change, ui_action。
- 並び順: consumed_at DESC（新しい順）。consumed_at が NULL の場合は confirmed_at でソート。
- ページネーション: MVP では `limit`（デフォルト 50）と `offset`（デフォルト 0）をクエリパラメータで受け取る。または「直近 50 件」のみ返し、ページネーションは省略する。

### 4.4 クエリパラメータ（フィルタ）

| パラメータ | 型 | 説明 |
|------------|-----|------|
| type | string | relation / grouping / decomposition のいずれか。省略時は全種別。 |
| node_id | UUID | この Node に関係する履歴のみ。node_id が一致するか、proposed_change の from_node_id / to_node_id / node_ids / parent_node_id に含まれるもの。 |
| limit | number | 取得件数。デフォルト 50。最大 100。 |
| offset | number | 先頭からのスキップ件数。デフォルト 0。 |

### 4.5 エラー

- 不正なクエリ（不正な UUID 等）は 400。
- 認証・認可は既存の Supabase RLS 等に従う。

---

## 5. MVP の割り切り

以下は Phase7-A の範囲外であり、実装しない。

| 項目 | 内容 |
|------|------|
| **Undo** | 履歴から「取り消す」「巻き戻す」操作は行わない。表示のみ。 |
| **編集** | 履歴の内容を編集したり、reason を追記したりしない。 |
| **高度検索** | 全文検索、複合条件、日時範囲の細かい指定は行わない。type と node_id の絞り込みのみ。 |
| **差分再表示** | Apply 前後の Diff を再表示したり、適用前の状態を復元したりしない。 |
| **reason の保存・表示** | 現状 confirmation_events に reason がないため、MVP では reason を表示しない。将来、Confirm 時に reason を proposed_change に含める拡張は別 doc で検討する。 |
| **status_change の履歴** | estimate-status による status 変更の履歴は本 Phase の対象外。 |
| **エクスポート** | CSV 出力等は行わない。 |
| **ツリーとの連携** | 履歴の 1 件を選んだときにツリー上で該当 Node をハイライトする機能は、MVP では必須としない。 |

---

## 6. Definition of Done

手動で確認できるチェック項目を以下とする。

| # | 確認項目 |
|---|----------|
| 1 | `GET /api/confirmations/history` を呼び出すと、consumed な confirmation を一覧で取得できる（relation / grouping / decomposition を含む）。 |
| 2 | 履歴 UI のブロックで、適用済み Diff が日時・type・対象の要約とともに表示される。 |
| 3 | 履歴の 1 件をクリックすると、その Diff の詳細（proposed_change の内容）が表示される。 |
| 4 | type フィルタ（relation / grouping / decomposition）が動作し、選択した種別の履歴のみ表示される。 |
| 5 | node_id フィルタが動作し、指定 Node に関係する履歴のみ表示される。 |
| 6 | 履歴表示が Organizer タブの relation / grouping / decomposition の Diff Apply フローを壊していない。 |
| 7 | 空の履歴（Apply がまだ一度もない場合）でもエラーにならず、「Apply 済みの Diff はまだありません」などのメッセージが表示される。 |
| 8 | Phase6 のツリー表示・開閉・キーボードナビ・詳細パネル連携が壊れていない。 |

---

以上。Phase7-A の履歴可視化の設計を定義した。実装は 78 以降の doc で行う。
