# 61 — Phase 5-B grouping Diff Apply 実装手順（事実ベース）

Phase5-B MVP（**grouping Diff**）の実装内容を「事実ベース」で確定し、実装者が Step0 〜 Step7 を迷わず進められるようにする。Phase5-A の confirmation 必須・consume・二重送信防止を踏襲し、DB は 60 準拠の**中間テーブル方式（groups + group_members）** を採用する。

**参照**: 59_phase5_b_mvp_plan.md、60_phase5_grouping_data_model.md、55_phase5_relation_diff_apply_implementation.md。

---

## 1. 追加・変更するファイル一覧

### 新規作成

| パス | 説明 |
|------|------|
| `supabase/migrations/20260209_create_groups.sql` | 60 の DDL。`groups`（id, group_label, created_at）と `group_members`（group_id, node_id, created_at）、PK/FK、idx_group_members_node。 |
| `src/app/api/diffs/grouping/apply/route.ts` | POST。body に `confirmation_id` 必須。proposed_change.type === "grouping"、group_label・node_ids を検証 → groups に 1 行 INSERT → group_members に N 行 INSERT → confirmation を consumed に更新。400/403/404/409 を返す。 |
| `src/lib/phase5Diff/transform.grouping.test.ts`（または transform.test.ts に grouping ケース追加） | grouping_proposals が空のとき grouping diffs が空、1 件を正しく Diff に変換、node_ids が 1 件以下でスキップ、reason 空でスキップ、node_ids の一部が validNodeIds に無いでスキップ・warnings。 |
| `src/lib/phase5Diff/validator.grouping.test.ts`（または validator.test.ts に grouping ケース追加） | 正常で VALID、node_ids が 1 件以下で INVALID、node_ids のいずれかが validNodeIds に無いで INVALID、reason 空で INVALID、diff が null または type が grouping でないで INVALID。 |

### 変更

| パス | 変更内容 |
|------|----------|
| `src/lib/phase5Diff/types.ts` | `GroupingChange`（group_label, node_ids）を追加。`Diff` の type を `"relation" \| "grouping"`、change を `RelationChange \| GroupingChange` のユニオンに拡張。必要に応じて `DiffRelation` / `DiffGrouping` の判別用ヘルパーを追加。 |
| `src/lib/phase5Diff/transform.ts` | **grouping_proposals** を走査し、51 §3.2・53 §3.3 に従って grouping タイプの Diff を生成して **diffs に追加**（relation と併存）。事前フィルタ：node_ids が 2 件未満・reason 空・node_ids のいずれかが validNodeIds に無い場合はスキップし warnings に追加。target_node_id = node_ids[0]。 |
| `src/lib/phase5Diff/validator.ts` | **type === "grouping"** の分岐を追加。必須フィールド（group_label 非空、node_ids 配列・2 件以上）、node_ids の全要素が validNodeIds に含まれること、reason 非空。満たさなければ INVALID。 |
| `src/app/api/organizer/run/route.ts` | 既に relation の Transform → Validator で diffs を組み立てているため、**transform が grouping も返す**ようにしたうえで、validateDiff で type ごとに判定。INVALID を除いた **relation と grouping の両方** を payload.diffs に載せる（既存の relation のみから、relation + grouping に拡張）。 |
| `src/app/api/confirmations/route.ts` | **proposed_change.type === "grouping"** の分岐を追加。diff_id / group_label / node_ids（配列・2 件以上）を検証。各 node_id が nodes に存在することを確認。confirmation_events に INSERT（node_id は node_ids[0] など代表 1 件でよい）。relation と同様、body の node_id は grouping のとき必須にしない。 |
| `src/components/ProposalPanel.tsx` | Organizer タブに「適用可能な Diff（grouping）」ブロックを追加。grouping タイプの Diff をカード表示（group_label、node_ids 件数、reason、NEEDS_REVIEW 時は「要確認」バッジと warnings）。「このDiffを反映する」→ confirm → POST /api/confirmations（proposed_change: type=grouping, diff_id, group_label, node_ids）→ POST /api/diffs/grouping/apply（confirmation_id）。**groupingApplyInFlightRef** で二重送信防止。成功時 onRefreshDashboard()、成功/失敗メッセージ表示。relation と grouping で ref を分ける。 |

---

## 2. DB（DDL）適用手順

- **DDL の所在**: 60 の §3 最小 DDL をそのまま `supabase/migrations/20260209_create_groups.sql` に配置する。ファイル名の日付（20260209）は実施日に合わせて変更してよい。
- **内容**: `CREATE TABLE groups`、`CREATE TABLE group_members`、`CREATE INDEX idx_group_members_node`、COMMENT。60 の SQL をコピーして使用する。
- **適用手順**:
  1. マイグレーション未実行の場合は、プロジェクトの Supabase マイグレーション手順に従い実行する（例: `supabase db push` または `supabase migration up`）。
  2. 既存の nodes テーブルが存在する環境で実行する。group_members は nodes(id) を REFERENCES するため、nodes が先に存在すること。
  3. 実行後、`groups` と `group_members` が存在することを SQL または Table Editor で確認する。

---

## 3. API I/O（grouping）

### 3.1 POST /api/organizer/run（拡張）

- **Request**: 変更なし。`{ dashboard, focusNodeId?, userIntent?, constraints? }`。
- **Response（成功時）**: 既存に加え、**diffs** に **relation と grouping の両方** を含める。各要素は Diff（type が "relation" または "grouping"）に `validation?: DiffValidationOutput` を付与した形。INVALID は含めない。

### 3.2 POST /api/confirmations（grouping 用拡張）

- **Request（grouping 用）**: `{ ui_action, proposed_change: { type: "grouping", diff_id, group_label, node_ids } }`。node_ids は string[] で 2 件以上。body の `node_id` は grouping のとき不要（内部で node_ids[0] などを node_id として記録可）。
- **Response**: 既存と同様。`{ ok, confirmation }`。confirmation に proposed_change がそのまま入る。

### 3.3 POST /api/diffs/grouping/apply（新規）

- **Request**: `{ confirmation_id: string }`（UUID）。必須。
- **Response（成功）**: `{ ok: true, applied: true, group_id, group_label, node_ids }`。
- **Response（エラー）**:
  - **400**: JSON 不正、confirmation_id 欠落、proposed_change.type !== "grouping"、group_label 欠落・空、node_ids が配列でない・2 件未満・いずれかが nodes に存在しない。
  - **403**: confirmation の expires_at 切れ。
  - **404**: confirmation が存在しない。
  - **409**: confirmation が既に consumed。

---

## 4. 実装順序（Step0 〜 Step7）

| Step | 内容 | 対応する実装 |
|------|------|----------------|
| **Step 0** | 型定義の拡張 | types.ts に GroupingChange、Diff の type を "relation" \| "grouping"、change を RelationChange \| GroupingChange に拡張。 |
| **Step 1** | Transform に grouping を追加 | transform.ts で grouping_proposals を走査。53 §3.3 に従い group_label / node_ids、target_node_id = node_ids[0]。事前フィルタ：node_ids 長さ 2 未満・reason 空・node_ids が validNodeIds に含まれない場合はスキップし warnings に追加。単体テストで grouping ケースを追加。 |
| **Step 2** | Validator に grouping を追加 | validator.ts で type === "grouping" の分岐。必須：group_label 非空、node_ids が配列で 2 件以上、全 node_id が validNodeIds に含まれる、reason 非空。満たさなければ INVALID。単体テストで grouping ケースを追加。 |
| **Step 3** | organizer/run の diffs に grouping を含める | run 内で transform が返す diffs に relation と grouping が含まれる。各 diff を validateDiff し、result !== "INVALID" のものを payload.diffs に載せる（既存の relation のみから、grouping も含むようにする）。 |
| **Step 4** | UI で grouping Diff 一覧表示 | ProposalPanel の Organizer タブで、diffs のうち type === "grouping" のものを「適用可能な Diff（grouping）」ブロックで表示。group_label・node_ids 件数・reason。NEEDS_REVIEW のとき「要確認」バッジと validation.warnings。 |
| **Step 5** | 1 Diff 選択 → Confirm → Apply | grouping 用「このDiffを反映する」クリック → confirm ダイアログ → OK で POST /api/confirmations（proposed_change: type=grouping, diff_id, group_label, node_ids）→ POST /api/diffs/grouping/apply（confirmation_id）。groupingApplyInFlightRef で二重送信防止。 |
| **Step 6** | refresh して反映確認 | Apply 成功後に onRefreshDashboard() を呼び、成功メッセージを表示。失敗時はエラーメッセージを表示。MVP ではグループ情報が API レベルで確認できれば OK。 |
| **Step 7** | 最小 E2E チェック | §5 の手動 E2E チェックリストを実施。 |

**Apply 時の処理（60 準拠）**: confirmation 取得 → type/group_label/node_ids 検証 → groups に 1 行 INSERT（id = gen_random_uuid()）→ group_members に node_ids の各 node_id で 1 行ずつ INSERT → confirmation を consumed に更新。

---

## 5. 手動 E2E 手順（チェックリスト）

- [ ] ダッシュボードに Node が 2 つ以上ある状態で、Organizer タブで「提案を生成」を実行する。
- [ ] Organizer が grouping_proposals を 1 件以上返す場合、run のレスポンスの `diffs` に **grouping** が含まれ、Organizer タブに「適用可能な Diff（grouping）」ブロックが表示される。
- [ ] 各 grouping Diff カードに group_label・node_ids 件数・reason が表示される。NEEDS_REVIEW の場合は「要確認」バッジと warnings が表示される。
- [ ] 1 件の grouping Diff で「このDiffを反映する」をクリックし、確認ダイアログで OK する。
- [ ] 適用中はボタンが「適用中…」等になり、二重クリックできない。
- [ ] 成功すると「反映しました」等のメッセージが出て、dashboard が再取得される。
- [ ] DB で `groups` に 1 行、`group_members` に該当 node_ids 分の行が追加されていることを確認する（または groups を返す API で確認）。
- [ ] 同じ confirmation で再送すると apply が 409（confirmation already consumed）となることを確認する。

---

## 6. MVP の割り切り（未対応）

| 項目 | 説明 |
|------|------|
| **decomposition** | decomposition_proposals の Diff 変換・表示・Apply は未対応。Phase5-B では grouping のみ。 |
| **Undo** | 適用したグループの削除（取り消し）は行わない。 |
| **一括適用** | 複数 Diff を選択して一度に Apply する機能はない。1 Diff ずつ Confirm → Apply。 |
| **重複 group の扱い** | 同一 group_label + 同一 node_ids の「内容が同じ」別 Apply は **MVP では許容**する。その都度新しい group_id で 1 グループが追加される。重複抑制は将来対応。 |
| **refresh 後の UI 描画** | グループが一覧やトレイに視覚的に表示されなくても MVP では不問。API レベルで groups / group_members が取得できればよい。 |

---

## 7. 単体テスト

- **transform**: grouping_proposals が空のとき grouping diffs が含まれない（または relation のみ）。grouping 1 件を正しく Diff に変換。node_ids が 1 件のみのときスキップ・warnings。reason が空のときスキップ。node_ids の一部が validNodeIds に無いときスキップ・warnings。
- **validator**: type === "grouping" で group_label・node_ids（2 件以上）・全 node_id が validNodeIds に含まれる・reason 非空 → VALID。node_ids が 1 件以下 → INVALID。node_ids のいずれかが validNodeIds に無い → INVALID。reason 空 → INVALID。diff が null または type が "grouping" でない → INVALID。

**実行コマンド**: `npx vitest run src/lib/phase5Diff --reporter=verbose`

（transform.test.ts / validator.test.ts に grouping ケースを追加するか、transform.grouping.test.ts・validator.grouping.test.ts を分離するかはプロジェクト方針に合わせる。いずれも上記ケースをカバーする。）

---

以上で、Phase5-B MVP（grouping）の実装手順を事実ベースで確定する。安全設計は Phase5-A と同様に confirmation 必須・consume・二重送信防止を踏襲する。
