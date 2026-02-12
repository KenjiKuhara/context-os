# 92 — Phase8-B reason の保存と履歴表示 MVP 設計

Phase8-B「reason の保存と履歴表示」を、DB スキーマ変更なしで `confirmation_events.proposed_change` に reason を含める形で実現する MVP の設計を定義する。拡張は行わず、既存を壊さない設計に限定する。

**参照**: 91_phase8_a_restore_mvp_closeout.md、[src/app/api/confirmations/route.ts](src/app/api/confirmations/route.ts)、[src/components/ProposalPanel.tsx](src/components/ProposalPanel.tsx)。

---

## 1. 目的・スコープ

**目的**: Confirm（Diff を適用する際の確認）時にユーザーが入力した「理由」を保存し、適用済み Diff 履歴の詳細でその理由を表示できるようにする。

**スコープ**:

| 項目 | 内容 |
|------|------|
| **対象 type** | relation / grouping / decomposition の 3 種（適用済み Diff 履歴に含まれるもののみ）。status_change は本 MVP では対象外とする。 |
| **保存先** | DB スキーマは変更しない。`confirmation_events.proposed_change`（既存 JSONB）に `reason` キーを追加する形で保存する。 |
| **取得** | 既存の GET /api/confirmations/history が `proposed_change` をそのまま返すため、reason を保存していればレスポンスに含まれる。履歴 API の変更は不要。 |

---

## 2. 制約

- **DB スキーマ変更なし**: confirmation_events のカラムは増やさない。proposed_change（JSONB）内に reason を含めるのみ。
- **proposed_change に reason を含める**: 既存の type 固有フィールドに加え、任意で `reason`（string）を格納する。
- **拡張しない**: 本 MVP では reason の編集・削除・検索・status_change への対応は行わない。既存の Apply フロー・履歴一覧・Phase8-A 復元は維持する。

---

## 3. データ形

- **proposed_change に追加するキー**: `reason`（任意、string）。
- **例（relation）**:  
  `{ "type": "relation", "diff_id": "...", "from_node_id": "...", "to_node_id": "...", "relation_type": "...", "reason": "ユーザーが入力した理由" }`
- **空の場合**: 未入力の場合は `reason` を省略するか、空文字で保存する。API は空文字も許容し、履歴表示では空のときは「理由」行を出さない。

---

## 4. API 変更

| API | 変更内容 |
|-----|----------|
| **POST /api/confirmations** | リクエスト body に任意で `reason`（string）を受け取る。relation / grouping / decomposition の各分岐で、INSERT する `proposed_change` に `reason` を含める（存在する場合のみ、または空文字で含める）。必須項目のバリデーションは既存どおり。 |
| **POST /api/diffs/relation/apply** | 変更なし。proposed_change の type / from_node_id / to_node_id / relation_type のみ使用。 |
| **POST /api/diffs/grouping/apply** | 変更なし。 |
| **POST /api/diffs/decomposition/apply** | 変更なし。 |
| **GET /api/confirmations/history** | 変更なし。既存どおり `proposed_change` を返すため、reason を保存していればそのまま含まれる。 |

**実装箇所**: [src/app/api/confirmations/route.ts](src/app/api/confirmations/route.ts) の relation / grouping / decomposition 各ブロックで `proposed_change` を組み立てている箇所（137–144, 189–194, 228–235 行付近）に、`reason` を追加する。

---

## 5. UI 変更

| 箇所 | 変更内容 |
|------|----------|
| **Confirm 時（Apply 時）** | relation / grouping / decomposition の各「適用可能な Diff」カード、および Phase8-A の「復元した Apply 候補」カードに、任意入力の「理由（任意）」欄を 1 つ追加する。ユーザーが「このDiffを反映する」を押したときに、その時点の理由入力値を読み取り、POST /api/confirmations の body に `reason` として含める。confirm 前にテキスト欄を表示しておき、OK 押下時にその値を送る形とする。 |
| **履歴詳細** | 履歴 1 件を選択して詳細を開いたとき、`proposed_change.reason` が存在しかつ空でない場合に「理由: {value}」を表示する。既存の from_node_id / to_node_id 等の下に 1 行追加する。relation / grouping / decomposition いずれも同じ扱い。 |

**実装箇所**: [ProposalPanel.tsx](src/components/ProposalPanel.tsx) の applyRelationDiff / applyGroupingDiff / applyDecompositionDiff で POST /api/confirmations を呼んでいる箇所に `reason` を付与。履歴詳細は type 別表示ブロック（from_node_id / to_node_id 等の下）に reason 表示を追加。

---

## 6. 変更ファイル一覧

| ファイル | 変更内容 |
|----------|----------|
| [src/app/api/confirmations/route.ts](src/app/api/confirmations/route.ts) | body から `reason`（任意）を取得。relation / grouping / decomposition の proposed_change に `reason` を追加して INSERT。 |
| [src/components/ProposalPanel.tsx](src/components/ProposalPanel.tsx) | (1) 適用可能 Diff（Organizer）および復元候補の各カードに「理由（任意）」入力欄を追加。(2) applyRelationDiff / applyGroupingDiff / applyDecompositionDiff で POST 時に reason を送る。(3) 履歴詳細で `pc.reason` があれば「理由: …」を表示。 |

---

## 7. 実装ステップ

1. **POST /api/confirmations**: body.reason を受け取り、relation / grouping / decomposition の proposed_change に含めて保存する。
2. **ProposalPanel（Apply 時）**: 各 Apply カードに「理由（任意）」入力欄を追加し、POST /api/confirmations の body に reason を付与する。
3. **ProposalPanel（履歴詳細）**: 履歴詳細で proposed_change.reason が存在しかつ空でない場合に「理由: {value}」を表示する。

---

## 8. Definition of Done

- relation / grouping / decomposition のいずれかを Apply する際に「理由（任意）」を入力でき、入力した内容が confirmation_events.proposed_change.reason に保存される。
- 履歴一覧でその履歴の詳細を開くと、保存された reason が表示される（空の場合は表示しない）。
- 既存の Apply フロー・履歴一覧・Phase8-A 復元は従来どおり動作する。Apply API は変更していない。

---

## 9. 既存を壊さないこと

| 項目 | 内容 |
|------|------|
| **Apply API 不変更** | POST /api/diffs/relation/apply 等は proposed_change の type 固有フィールドのみ参照する。reason は参照しないため、Apply API のコードは変更しない。 |
| **既存履歴の表示** | reason なしで保存された既存の履歴は、履歴詳細で「理由」行を出さない（proposed_change.reason が無いまたは空のときは表示しない）。 |
| **Phase8-A 復元** | 復元した Apply 候補から Apply する際も「理由（任意）」を入力可能とする。既存の復元フローは維持する。 |

---

以上。Phase8-B reason の保存と履歴表示 MVP の設計を定義した。
