# 93 — Phase8-B reason の保存と履歴表示 実装計画

Phase8-B「reason の保存と履歴表示」の実装計画を定義する。92_phase8_b_reason_mvp_design.md に基づき、API 変更箇所・フロント変更箇所・実装順序（Step0〜）・影響範囲・DoD・既存を壊さないための注意点を明確に整理する。

**前提**: 92_phase8_b_reason_mvp_design.md。本計画は 92 の実装手順を Step 単位で具体化する。

**参照**: [src/app/api/confirmations/route.ts](src/app/api/confirmations/route.ts)、[src/components/ProposalPanel.tsx](src/components/ProposalPanel.tsx)。

---

## 1. API 変更箇所

- **対象**: POST /api/confirmations のみ。POST /api/diffs/relation/apply、grouping/apply、decomposition/apply および GET /api/confirmations/history は変更しない。
- **ファイル**: [src/app/api/confirmations/route.ts](src/app/api/confirmations/route.ts)

| 変更内容 | 詳細 |
|----------|------|
| **body.reason の取得** | リクエスト処理の早い段階で、`body.reason` を取得する。`typeof body.reason === "string" ? body.reason.trim() : ""`。必須にしない。1 変数にまとめ、relation / grouping / decomposition の 3 ブロックで共通利用する。 |
| **decomposition ブロック** | 140–145 行付近。INSERT する `proposed_change` に `reason` を追加する（存在する場合のみ、または空文字で含める）。既存の type / diff_id / parent_node_id / add_children は変更しない。 |
| **grouping ブロック** | 189–195 行付近。同様に `proposed_change` に `reason` を追加する。 |
| **relation ブロック** | 228–235 行付近。同様に `proposed_change` に `reason` を追加する。 |
| **バリデーション** | reason は任意のため、既存の必須チェック（diff_id、from_node_id 等）は変更・削除しない。status_change 分岐には reason を追加しない（92 のスコープ）。 |

---

## 2. フロント変更箇所

- **対象**: [src/components/ProposalPanel.tsx](src/components/ProposalPanel.tsx) のみ。

| 箇所 | 変更内容 |
|------|----------|
| **Apply 時（理由入力）** | (A) 適用可能な Diff（relation / grouping / decomposition）の各カード内に「理由（任意）」用の入力欄（`<input type="text">` または `<textarea>`）を 1 つ追加する。Phase8-A の「復元した Apply 候補」の各カードにも同様に「理由（任意）」欄を追加する。(B) applyRelationDiff / applyGroupingDiff / applyDecompositionDiff の内部で、POST /api/confirmations の body に `reason: 入力値の文字列` を追加する。入力値は該当カードの入力欄から取得する（state で管理する場合: カードごとまたはブロックごとの key に紐づく state）。 |
| **履歴詳細** | 履歴 1 件の詳細ブロック（isSelected 時）で、type が relation / grouping / decomposition のとき、既存の from_node_id / to_node_id 等の表示の下に、`proposed_change.reason` が存在しかつ空でない場合のみ「理由: {pc.reason}」を 1 行表示する。1335–1368 行付近の type 別ブロック内に追加する。 |

---

## 3. 実装ステップ（Step0〜Step4）

### Step0: 現状確認（変更なし）

- **目的**: POST /api/confirmations の request body の形、ProposalPanel の apply*Diff で POST を呼んでいる箇所、履歴詳細の type 別表示箇所を確認する。
- **変更対象**: なし（事前調査）。
- **確認内容**: confirmations/route.ts の relation / grouping / decomposition 各ブロックで proposed_change を組み立てている行番号。ProposalPanel の applyRelationDiff（513–527 行付近）、applyGroupingDiff（567–580 行付近）、applyDecompositionDiff（625–638 行付近）で POST を呼んでいる箇所。履歴詳細の type 別表示（1335–1368 行付近）。

---

### Step1: API — reason の受け取りと保存

- **目的**: body.reason を受け取り、relation / grouping / decomposition の proposed_change に含めて INSERT する。
- **変更対象**: [src/app/api/confirmations/route.ts](src/app/api/confirmations/route.ts)
- **内容**:
  - リクエスト処理の早い段階（例: proposedChange の検証の前後）で `const reason = typeof body.reason === "string" ? body.reason.trim() : "";` を追加する。
  - decomposition ブロックの proposed_change に `reason` を追加（例: `reason: reason ?? ""` または存在する場合のみ spread）。
  - grouping ブロックの proposed_change に同様に `reason` を追加。
  - relation ブロックの proposed_change に同様に `reason` を追加。
  - status_change 分岐は変更しない。

---

### Step2: フロント — Apply 時の「理由（任意）」入力と POST に reason 付与

- **目的**: 各 Apply カードに理由入力欄を追加し、Apply 時にその値を POST に含める。
- **変更対象**: [src/components/ProposalPanel.tsx](src/components/ProposalPanel.tsx)
- **内容**:
  - 適用可能 Diff（Organizer）の relation / grouping / decomposition 各カード内に「理由（任意）」入力欄を 1 つ追加する。復元した Apply 候補の relation / grouping / decomposition 各カードにも同様に追加する。
  - 入力値は state で管理する（例: カードごとに diff_id を key にした state、または relation / grouping / decomposition 用の 1 つずつ）。実装方針に応じて決定する。
  - applyRelationDiff / applyGroupingDiff / applyDecompositionDiff 内で、POST /api/confirmations の body に `reason: 入力値の文字列` を追加する。既存の window.confirm の前後は維持する（confirm 前に入力欄が表示され、OK 押下時にその時点の入力値を送る）。

---

### Step3: フロント — 履歴詳細で reason 表示

- **目的**: 履歴詳細で proposed_change.reason を表示する。
- **変更対象**: [src/components/ProposalPanel.tsx](src/components/ProposalPanel.tsx)
- **内容**:
  - 履歴詳細の type 別ブロック（relation / grouping / decomposition）の末尾に、`pc?.reason` が存在しかつ空でないとき「理由: {String(pc.reason)}」を 1 行表示する。3 タイプ共通で、各ブロックの既存表示（from_node_id 等 / group_label 等 / parent_node_id 等）の直後に追加する。
  - 既存履歴（reason なし）の場合は「理由」行を出さない（`pc?.reason != null && String(pc.reason).trim() !== ""` のときのみ表示）。

---

### Step4: 手動 E2E

- **目的**: DoD に基づき、reason の保存・表示と既存機能が壊れていないことを確認する。
- **変更対象**: なし（手動確認）。
- **内容**: §5 の Definition of Done に従い、チェックリストを 1 つずつ実施する。結果は別 doc に記録してもよい。

---

## 4. 影響範囲

| 項目 | 内容 |
|------|------|
| **変更ファイル** | [src/app/api/confirmations/route.ts](src/app/api/confirmations/route.ts)、[src/components/ProposalPanel.tsx](src/components/ProposalPanel.tsx)。 |
| **変更しないもの** | POST /api/diffs/relation/apply、grouping/apply、decomposition/apply。GET /api/confirmations/history。DB スキーマ。Dashboard、TreeList、その他コンポーネント。 |
| **影響を受ける機能** | Apply 時に reason を送れるようになる。履歴詳細で reason が表示される。既存の Apply フロー（confirm → POST confirmations → POST diffs/*/apply）はそのまま。既存履歴（reason なし）は理由行を出さない。 |

---

## 5. Definition of Done

| # | 確認項目 | 期待結果 |
|---|----------|----------|
| 1 | relation / grouping / decomposition のいずれかを Apply する際に「理由（任意）」を入力できる | 入力した内容が confirmation_events.proposed_change.reason に保存される。 |
| 2 | 履歴一覧でその履歴の詳細を開く | 保存された reason が表示される。空の場合は「理由」行を出さない。 |
| 3 | 既存の Apply フロー・履歴一覧・Phase8-A 復元は従来どおり動作する | confirm → POST confirmations → POST diffs/*/apply が成功し、履歴が更新される。Apply API は変更していない。 |

---

## 6. 既存を壊さないための注意点

| 項目 | 内容 |
|------|------|
| **Apply API に手を入れない** | reason は confirmation 保存用のみ。POST /api/diffs/*/apply は proposed_change の type 固有フィールドだけを参照する。reason は参照しないため、Apply API のコードは変更しない。 |
| **既存履歴の表示** | proposed_change.reason が無いまたは空のときは「理由」行を表示しない。存在チェックと空文字チェックを必ず行う。 |
| **status_change は対象外** | confirmations の status_change 分岐には reason を追加しない（92 のスコープ）。 |
| **Phase8-A 復元** | 復元カードにも「理由（任意）」を付け、Apply 時に reason を送る。復元フロー自体（historyItemToOrganizerDiff、setRestoredDiff、apply*Diff 呼び出し）は変更しない。 |
| **必須項目のバリデーション** | diff_id / from_node_id / to_node_id / relation_type 等の既存必須チェックは変更・削除しない。 |

---

## 7. 参照ドキュメント

| 番号 | ファイル名 |
|------|------------|
| 92 | 92_phase8_b_reason_mvp_design.md |
| 91 | 91_phase8_a_restore_mvp_closeout.md |
| 81 | 81_phase7_a_history_no_reload_update.md（Apply 後の履歴再取得） |

---

以上。Phase8-B reason の保存と履歴表示の実装計画を定義した。
