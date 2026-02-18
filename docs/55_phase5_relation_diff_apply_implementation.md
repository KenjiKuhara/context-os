# 55 — Phase 5-A relation Diff Apply 実装手順（実装後ドキュメント）

Phase5-A MVP（**relation Diff のみ**）の実装内容を「実装後の事実」として記録する。命名規則は `00_naming_convention.md` に準拠。

**前提ドキュメント**: 51_phase5_diff_schema.md、52_phase5_diff_validator.md、53_phase5_organizer_to_diff_transform.md、54_phase5_organizer_apply_mvp_plan.md。

---

## 1. 追加・変更したファイル一覧

### 新規作成

| パス | 説明 |
|------|------|
| `src/lib/phase5Diff/types.ts` | Diff・DiffValidationResult（VALID/INVALID/NEEDS_REVIEW）・RelationChange・TransformContext・ValidateDiffContext 等の型定義 |
| `src/lib/phase5Diff/transform.ts` | `transformOrganizerReportToDiffs(report, context)`。relation_proposals のみ Diff に変換（53 準拠）。diff_id は `crypto.randomUUID()`、created_at は `new Date().toISOString()` |
| `src/lib/phase5Diff/validator.ts` | `validateDiff(diff, context)`。relation のみ：必須フィールド・from≠to・validNodeIds・既存 relation 重複（existingRelations を渡した場合のみ） |
| `src/lib/phase5Diff/transform.test.ts` | transform の単体テスト（空・1 件変換・スキップ系） |
| `src/lib/phase5Diff/validator.test.ts` | validator の単体テスト（VALID/INVALID/NEEDS_REVIEW・重複・null・type 不一致） |
| `supabase/migrations/20260208_create_relations.sql` | `relations` テーブル（id, from_node_id, to_node_id, relation_type, created_at）、UNIQUE(from_node_id, to_node_id, relation_type)、nodes への FK |
| `src/app/api/diffs/relation/apply/route.ts` | POST。confirmation_id 必須。confirmation 検証 → relations に 1 行 INSERT → confirmation を consumed に更新 |

### 変更

| パス | 変更内容 |
|------|----------|
| `src/app/api/organizer/run/route.ts` | 成功時（result.ok && result.report）に Transform → Validator を実行し、INVALID を除いた relation Diff を `diffs` で返す。`OrganizerDiffItem` 型を export |
| `src/app/api/confirmations/route.ts` | `proposed_change.type === "relation"` の分岐を追加。diff_id / from_node_id / to_node_id / relation_type を検証し、nodes に from/to が存在することを確認して confirmation_events に INSERT。relation のときは body の `node_id` を必須にしない |
| `src/components/ProposalPanel.tsx` | Organizer タブに「適用可能な Diff（relation）」ブロックを追加。Diff カード表示（from→to, relation_type, reason、NEEDS_REVIEW 時は「要確認」バッジと warnings）。「このDiffを反映する」→ confirm → POST /api/confirmations → POST /api/diffs/relation/apply。二重送信防止（relationApplyInFlightRef）。成功時 onRefreshDashboard()、成功/失敗メッセージ表示 |

---

## 2. API の I/O

### 2.1 POST /api/organizer/run（拡張）

- **Request**: 変更なし。`{ dashboard, focusNodeId?, userIntent?, constraints? }`。
- **Response（成功時）**: 既存の `ok`, `report`, `errors`, `warnings`, `rendered?` に加え、
  - **`diffs`**（任意）: `OrganizerDiffItem[]`。relation タイプのみ。VALID と NEEDS_REVIEW のものだけ（INVALID は含めない）。
  - 各要素は Diff に `validation?: DiffValidationOutput` を付与した形。UI で「要確認」表示や errors/warnings 表示に利用。

### 2.2 POST /api/confirmations（relation 用拡張）

- **Request（relation 用）**: `{ ui_action, proposed_change: { type: "relation", diff_id, from_node_id, to_node_id, relation_type } }`。`node_id` は relation のとき不要（内部で from_node_id を node_id として記録）。
- **Response**: 既存と同様。`{ ok, confirmation }`。confirmation に `proposed_change` がそのまま入る。

### 2.3 POST /api/diffs/relation/apply（新規）

- **Request**: `{ confirmation_id: string }`（UUID）。必須。
- **Response（成功）**: `{ ok: true, applied: true, from_node_id, to_node_id, relation_type }`。
- **Response（エラー）**:
  - 400: JSON 不正、confirmation_id 欠落、proposed_change.type !== "relation"、from_node_id / to_node_id / relation_type 欠落。
  - 403: confirmation の expires_at 切れ。
  - 404: confirmation が存在しない。
  - 409: confirmation が既に consumed、または relation が既に存在（DB UNIQUE 違反 23505）。

---

## 3. 実装の順序（Step0 〜 Step7 に沿った事実）

| Step | 内容 | 対応した実装 |
|------|------|----------------|
| **Step 0** | 型定義 | `src/lib/phase5Diff/types.ts` に Diff, RelationChange, DiffValidationResult, TransformContext, ValidateDiffContext を定義。52 の VALID/INVALID/NEEDS_REVIEW を型で表現。 |
| **Step 1** | Transform 実装 | `transformOrganizerReportToDiffs` を `transform.ts` に実装。relation_proposals のみ走査。validNodeIds に無い from/to・from===to・reason 空はスキップし warnings に追加。単体テストは `transform.test.ts`。 |
| **Step 2** | validateDiff 実装 | `validator.ts` に `validateDiff(diff, context)`。relation のみ：必須フィールド・from≠to・validNodeIds に from/to/target が含まれること。`context.existingRelations` を渡した場合のみ既存 relation 重複チェック（重複なら INVALID）。単体テストは `validator.test.ts`。 |
| **Step 3** | organizer/run のレスポンス拡張 | run 内で validNodeIds 取得 → transformOrganizerReportToDiffs → 各 diff を validateDiff。result !== "INVALID" のものだけ `payload.diffs` に載せる。organizer_run_id は `organizer-${Date.now()}-${random}` で生成。 |
| **Step 4** | UI で Diff 一覧表示 | ProposalPanel の Organizer タブで `organizerResult?.ok && organizerResult.diffs?.length` のとき「適用可能な Diff（relation）」ブロックを表示。各 Diff をカード表示（from→to, relation_type, reason）。NEEDS_REVIEW のとき「要確認」バッジと validation.warnings を表示。 |
| **Step 5** | 1 Diff 選択 → Confirm → Apply | 「このDiffを反映する」クリック → confirm ダイアログ → OK で POST /api/confirmations（proposed_change: type=relation, diff_id, from_node_id, to_node_id, relation_type）→ POST /api/diffs/relation/apply（confirmation_id）。relationApplyInFlightRef で二重送信防止。 |
| **Step 6** | refresh して反映確認 | Apply 成功後に onRefreshDashboard() を呼び、成功メッセージを表示。失敗時は relationApplyError でエラーメッセージを表示。 |
| **Step 7** | 最小 E2E チェック | 手動 E2E は §5 のチェックリストで実施。 |

---

## 4. 既存 relation 重複チェックの仕様（MVP）

- **validator**: `context.existingRelations` を**渡した場合のみ**、既存 relation との重複をチェックする。重複なら INVALID。
- **organizer/run**: MVP では `existingRelations` を渡していない（DB から取得していない）。そのため run 時点では「既存 relation 重複」で INVALID にはならない。
- **apply 時**: `relations` テーブルの UNIQUE(from_node_id, to_node_id, relation_type) により、重複 INSERT は 409（relation already exists）で返す。UI ではこの 409 をエラーメッセージで表示する。

---

## 5. 手動 E2E 手順（最小チェックリスト）

### MVP で期待する refresh の定義

Apply 成功後の「refresh」について、MVP では以下を満たせばよいとする。

- **dashboard を再取得すること**  
  Apply 成功時に `onRefreshDashboard()` が呼ばれ、dashboard 用の API が再実行されてデータが再取得されること。
- **relations の存在が API レベルで確認できれば OK とすること**  
  追加した relation が DB に存在し、それを返す API（例: dashboard や relations を返すエンドポイント）で取得できることを確認できれば、E2E の「反映確認」としては十分とする。
- **UI 上で線や表示が変わらなくても MVP では不問とすること**  
  グラフの線・一覧の関係表示など、UI 上で relation が視覚的に描画・表示されていなくても、MVP の完了条件とはしない。それらは今後の拡張とする。

---

### チェックリスト

- [ ] ダッシュボードに Node が 2 つ以上ある状態で、Organizer タブで「提案を生成」を実行する。
- [ ] Organizer が relation_proposals を 1 件以上返す場合、run のレスポンスに `diffs` が含まれ、Organizer タブに「適用可能な Diff（relation）」ブロックが表示される。
- [ ] 各 Diff カードに from→to・relation_type・reason が表示される。NEEDS_REVIEW の場合は「要確認」バッジと warnings が表示される。
- [ ] 1 件の Diff で「このDiffを反映する」をクリックし、確認ダイアログで OK する。
- [ ] 適用中はボタンが「適用中…」等になり、二重クリックできない。
- [ ] 成功すると「反映しました」等のメッセージが出て、**dashboard が再取得される**（上記「MVP で期待する refresh の定義」に従う）。
- [ ] 反映結果として、**該当の relation が API レベルで確認できること**（例: relations を返す API や dashboard に relations が含まれる場合、その応答に追加した 1 件が含まれる）。UI 上で線や表示が変わらなくても MVP では不問。
- [ ] 同じ Diff を再度適用しようとした場合（または既に同じ from/to/relation_type が DB にある場合）、apply が 409 となり、エラーメッセージで「relation already exists」等が確認できる。

---

## 6. MVP なので未対応であることの明記

以下は **Phase5-A MVP では未対応** であり、実装もしていない。

| 項目 | 説明 |
|------|------|
| **decomposition** | decomposition_proposals は Transform で Diff に変換していない（relation のみ変換）。UI にも出さない。 |
| **grouping** | grouping_proposals も同様に MVP では変換・表示しない。 |
| **Undo** | 適用した relation の取り消し（削除）は行わない。 |
| **一括適用** | 複数 Diff を選択して一度に Apply する機能はない。1 Diff ずつ Confirm → Apply。 |
| **run 時点での既存 relation 重複** | existingRelations を run で渡していないため、重複は apply 時の DB UNIQUE と 409 で検出する。 |

---

## 7. テスト（単体）

- **transform.test.ts**: relation_proposals が空のとき diffs が空、1 件を正しく変換、from が validNodeIds に無いでスキップ・warnings、from===to でスキップ、reason 空でスキップ。
- **validator.test.ts**: 正常で VALID、from===to で INVALID、from/target が validNodeIds に無いで INVALID、existingRelations で重複時 INVALID・重複無しで VALID、diff が null または type が relation でないで INVALID。

実行: `npx vitest run src/lib/phase5Diff --reporter=verbose`
