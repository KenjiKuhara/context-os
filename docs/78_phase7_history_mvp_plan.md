# 78 — Phase7-A Diff / Confirmation 履歴可視化 MVP 実装計画

77_phase7_history_design.md に基づき、Phase7-A「Diff / Confirmation 履歴可視化」の MVP 実装計画を定義する。本ドキュメントは設計ではなく「実装順序の計画」とする。

**前提**: 77_phase7_history_design.md（設計定義）、76_phase7_scope.md、51_phase5_diff_schema.md。

---

## 1. 実装全体像

### 1.1 構成図（文章で）

```
[Organizer タブ]
  ├─ 既存: 適用可能な Diff（relation / grouping / decomposition）
  │   └─ 現状通り。変更なし。
  │
  └─ 新規: 適用済み Diff 履歴 ブロック
        ├─ 履歴一覧（タイムライン形式・新しい順）
        │   └─ 1 行: 日時 | 種別 | 対象の要約
        ├─ フィルタ
        │   ├─ type: すべて / relation / grouping / decomposition
        │   └─ node_id: 入力欄（任意）
        ├─ 詳細表示（行クリック時）
        │   └─ proposed_change の内容を表示
        └─ 空のとき: 「Apply 済みの Diff はまだありません」
```

### 1.2 データフロー

```
[フロント] ProposalPanel
    │
    │ GET /api/confirmations/history?type=...&node_id=...&limit=50&offset=0
    ▼
[API] src/app/api/confirmations/history/route.ts（新規）
    │
    │ consumed = true の confirmation のみ取得
    │ proposed_change.type !== "status_change" に限定
    │ consumed_at DESC でソート
    ▼
[DB] confirmation_events
    │
    │ SELECT ... WHERE consumed = true AND proposed_change->>'type' IN ('relation','grouping','decomposition')
    ▼
[レスポンス] { ok: true, items: [...] }
```

### 1.3 実装する要素

| 要素 | 内容 | 変更種別 |
|------|------|----------|
| **新規 API** | GET /api/confirmations/history。consumed な confirmation を取得。読み取り専用。 | 新規ファイル |
| **UI ブロック追加** | Organizer タブ内に「適用済み Diff 履歴」ブロックを追加。一覧表示。 | ProposalPanel に追加 |
| **フィルタ処理** | type フィルタ（すべて / relation / grouping / decomposition）。node_id フィルタ（任意入力）。 | フロント state + API クエリ |
| **詳細表示** | 行クリックで proposed_change の内容をパネルに表示。 | フロント state（選択中の confirmation_id） |
| **既存フローへの影響** | なし。Organizer の Diff 表示・Apply フローは触らない。Phase6 ツリーも触らない。 | 影響なし |

### 1.4 既存フローとの関係

- **Organizer run**: organizer/run → diffs 取得 → 「このDiffを反映する」→ confirmations 発行 → apply API。**本計画では変更しない。**
- **Apply API**: relation / grouping / decomposition の各 apply は confirmation を consumed に更新する。**本計画では変更しない。**
- **ProposalPanel**: 既存の relation / grouping / decomposition ブロックはそのまま。**その下に履歴ブロックを追加するだけ。**

---

## 2. 実装ステップ（Step0〜Step7）

### Step0: confirmation_events の読み取りロジック整理

- **目的**: 履歴取得に必要な SELECT 条件・ソート・フィルタを事前に整理する。
- **変更対象**: なし（事前調査）。
- **確認**: 77 §1 の confirmation_events スキーマと proposed_change の構造を参照。consumed = true、proposed_change.type IN ('relation','grouping','decomposition') で絞る。node_id フィルタ時は node_id 一致または proposed_change 内の from_node_id / to_node_id / node_ids / parent_node_id に含まれるもの。

---

### Step1: GET /api/confirmations/history 実装

- **目的**: 履歴取得用の読み取り専用 API を新設する。
- **変更対象**:
  - `src/app/api/confirmations/history/route.ts`（**新規**）
- **内容**:
  - GET メソッドのみ受け付ける。
  - クエリパラメータ: type, node_id, limit（デフォルト 50）, offset（デフォルト 0）。
  - confirmation_events から consumed = true かつ proposed_change.type IN ('relation','grouping','decomposition') を取得。
  - type 指定時は proposed_change.type でさらに絞る。
  - node_id 指定時は node_id 一致、または proposed_change の JSONB 内で該当 ID を含むものを絞る（relation: from_node_id / to_node_id、grouping: node_ids、decomposition: parent_node_id）。
  - consumed_at DESC でソート。consumed_at が NULL の場合は confirmed_at でソート。
  - レスポンス: { ok: true, items: [...] }。各 item に confirmation_id, node_id, confirmed_at, consumed_at, proposed_change, ui_action を含める。

---

### Step2: 単体で API レスポンス確認

- **目的**: 履歴 API が正しく動作することを確認する。
- **変更対象**: なし（手動確認または curl / ブラウザ）。
- **確認**: GET /api/confirmations/history を呼び、consumed な confirmation が返ることを確認。type / node_id クエリで絞り込みが動作することを確認。空のときは items: [] が返ることを確認。

---

### Step3: Organizer タブに履歴ブロック追加

- **目的**: Organizer タブ内に「適用済み Diff 履歴」ブロックを追加し、一覧を表示する。
- **変更対象**:
  - `src/components/ProposalPanel.tsx`
- **内容**:
  - Organizer タブ内、既存の relation / grouping / decomposition ブロックの下に「適用済み Diff 履歴」セクションを追加。
  - マウント時または Organizer タブ表示時に GET /api/confirmations/history を呼び出す。
  - 取得した items をタイムライン形式（新しい順）で一覧表示。1 行に日時・種別・対象の要約を表示。
  - 空のときは「Apply 済みの Diff はまだありません」と表示。
  - エラー時は「履歴の取得に失敗しました」等を表示。

---

### Step4: 詳細表示実装

- **目的**: 履歴の 1 行をクリックしたとき、その Diff の詳細（proposed_change）を表示する。
- **変更対象**:
  - `src/components/ProposalPanel.tsx`
- **内容**:
  - 選択中の confirmation_id を state で保持する。
  - 行クリックで selectedConfirmationId を設定し、対応する item の proposed_change を詳細パネルに表示する。
  - relation: from_node_id, to_node_id, relation_type。grouping: group_label, node_ids。decomposition: parent_node_id, add_children の各 title。
  - 詳細パネルを閉じる UI（再度クリックまたは閉じるボタン）。

---

### Step5: type フィルタ実装

- **目的**: 履歴を type 種別で絞り込めるようにする。
- **変更対象**:
  - `src/components/ProposalPanel.tsx`
  - `src/app/api/confirmations/history/route.ts`（Step1 で type クエリ対応済みなら変更不要）
- **内容**:
  - 履歴ブロック上部に type フィルタ UI（すべて / relation / grouping / decomposition）を追加。
  - 選択変更時に API を再呼び出し（type クエリを付与）。
  - または、クライアント側でフィルタする（件数が少ない場合は簡易実装）。

---

### Step6: node_id フィルタ実装

- **目的**: 特定 Node に関係する履歴のみ表示できるようにする。
- **変更対象**:
  - `src/components/ProposalPanel.tsx`
  - `src/app/api/confirmations/history/route.ts`（Step1 で node_id クエリ対応済みなら変更不要）
- **内容**:
  - 履歴ブロック上部に node_id 入力欄を追加（任意。入力時のみフィルタ適用）。
  - 入力時に API を再呼び出し（node_id クエリを付与）。
  - UUID 形式の簡易バリデーション。不正な場合はエラーメッセージ表示。

---

### Step7: 手動 E2E

- **目的**: §5 の E2E チェックリストに従い、全体の動作を確認する。
- **変更対象**: なし（手動確認）。
- **内容**: §5 のチェックリストを 1 つずつ実施し、結果を記録する。別 doc（79_phase7_history_e2e_result.md 等）に記録する。

---

## 3. 影響範囲の確認

実装前に以下を事前に列挙する。実装後も確認する。

| 確認項目 | 影響の有無 | 確認方法 |
|----------|------------|----------|
| **Organizer の Diff 表示が壊れないか** | なし（履歴ブロックは追加のみ） | Organizer run 後、relation / grouping / decomposition の Diff が従来どおり表示されること。 |
| **Apply フローが壊れないか** | なし（Apply API は触らない） | 「このDiffを反映する」→ Confirm → Apply が成功すること。成功メッセージ・refresh が動作すること。 |
| **Phase6 ツリーが壊れないか** | なし（dashboard / TreeList は触らない） | フラット／ツリー切替、開閉、キーボードナビ、詳細パネル連携が動作すること。 |
| **confirmation 発行が壊れないか** | なし（POST /api/confirmations は触らない） | Confirm 時に confirmation_id が返り、Apply に使用できること。 |
| **既存 API のレスポンスが変わらないか** | なし（新規 API のみ追加） | organizer/run、dashboard、confirmations POST のレスポンスが従来どおりであること。 |

---

## 4. MVP の安全設計

以下を厳守する。

| 項目 | 内容 |
|------|------|
| **confirmation は変更しない** | 履歴 API は SELECT のみ。INSERT / UPDATE / DELETE は行わない。POST /api/confirmations は触らない。 |
| **consumed の扱いは変更しない** | Apply API が consumed を true に更新する既存ロジックは変更しない。履歴 API は consumed = true のものを読み取るだけ。 |
| **DB スキーマは変更しない** | confirmation_events のテーブル・カラムは一切変更しない。マイグレーションは行わない。 |
| **読み取り専用 API とする** | GET /api/confirmations/history は GET のみ。副作用を持たない。 |
| **既存 Apply フローに手を入れない** | relation / grouping / decomposition の apply API は変更しない。ProposalPanel の Apply 処理も変更しない。 |

---

## 5. E2E チェックリスト

77_phase7_history_design.md §6 の Definition of Done を再掲し、実装確認用のチェックリストに落とす。

| # | 確認項目 | 手順 | 期待結果 |
|---|----------|------|----------|
| 1 | 履歴 API が consumed な confirmation を返す | GET /api/confirmations/history を呼ぶ（curl またはブラウザ）。 | relation / grouping / decomposition のいずれかを含む items が返る。consumed = true のもののみ。 |
| 2 | 履歴 UI で日時・type・対象が表示される | Organizer タブを開き、履歴ブロックを確認する。 | 適用済み Diff が日時・種別・対象の要約とともに表示される。 |
| 3 | 履歴の 1 件をクリックで詳細表示 | 履歴の 1 行をクリックする。 | proposed_change の内容（from_node_id, to_node_id 等）が表示される。 |
| 4 | type フィルタが動作する | type フィルタで relation / grouping / decomposition を選択する。 | 選択した種別の履歴のみ表示される。 |
| 5 | node_id フィルタが動作する | node_id 入力欄に UUID を入力する。 | その Node に関係する履歴のみ表示される。 |
| 6 | Organizer の Diff Apply が壊れていない | Organizer run → 1 Diff 選択 → 「このDiffを反映する」→ Confirm → Apply。 | 成功し、refresh 後に対象が反映される。履歴に新規件が追加される。 |
| 7 | 空の履歴でエラーにならない | Apply がまだ一度もない環境で Organizer タブを開く。 | 「Apply 済みの Diff はまだありません」等が表示され、エラーにならない。 |
| 8 | Phase6 ツリーが壊れていない | Dashboard でフラット／ツリー切替、開閉、キーボードナビ、詳細パネル連携を確認する。 | 従来どおり動作する。 |

---

以上。Phase7-A の MVP 実装計画を定義した。実装は本 doc の Step0〜Step7 に従って行う。
