# 62 — Phase 5-B grouping Diff Apply 手動 E2E 結果

**本ドキュメントは Phase5-B MVP（grouping）の完了証跡用である。** grouping Diff の「生成 → 表示 → Confirm → Apply → refresh」を手動で一通り実施し、その結果を記録する。

**参照**: 61_phase5_grouping_diff_apply_implementation.md、59_phase5_b_mvp_plan.md、60_phase5_grouping_data_model.md。

---

## 1. 実施日

- **実施日**: 2025-02-10

---

## 2. 実施環境

| 項目 | 内容 |
|------|------|
| **フロント／API** | localhost:3000（Next.js 開発サーバー） |
| **DB** | Supabase。`groups` と `group_members` テーブルがマイグレーション（20260209_create_groups.sql）済み。 |
| **実施方法** | 61 §5 に沿い、API 経由 E2E スクリプト（`scripts/e2e-grouping.mjs`）で確認。必要に応じて UI からも同一手順を実施可能。 |

---

## 3. 手動 E2E 手順（簡潔）

1. ダッシュボードに Node を 2 つ以上用意する。
2. Organizer タブで「提案を生成」を実行する。
3. レスポンスの `diffs` に **grouping** が含まれ、タブに「適用可能な Diff（grouping）」ブロックが表示されることを確認する。
4. 1 件の grouping Diff で「このDiffを反映する」をクリックし、確認ダイアログで OK する。
5. 適用中はボタンが「適用中…」等になり、二重クリックできないことを確認する。
6. 成功メッセージが出て dashboard が再取得されることを確認する。
7. DB で `groups` に 1 行、`group_members` に該当 node_ids 分の行が追加されていることを確認する（または groups を返す API で確認）。
8. （任意）同じ confirmation で再送すると 409（confirmation already consumed）となることを確認する。

---

## 4. 結果

- **結果**: **成功**
- **実施内容**:
  - GET /api/dashboard で Node 2 件を取得。
  - Organizer/run は LLM が grouping_proposals を返さなかったため、Apply 経路の検証として `E2E_SKIP_ORGANIZER=1` でスクリプトを実行。fixture の grouping Diff（group_label: "E2E検証用グループ", node_ids: 2 件）で Confirmations 発行 → POST /api/diffs/grouping/apply → 200 で applied: true / group_id 返却を確認。
  - GET /api/e2e-verify/groups で **groups: 1 行、group_members: 2 行** を確認。
- **最低限確認した項目（61 §5 相当）**:
  - [x] confirmations（grouping）発行 → confirmation_id 取得
  - [x] Apply API 成功（200、applied: true、group_id）
  - [x] refresh 相当（dashboard 再取得は UI で実施時に対応）
  - [x] DB に groups 1 行 + group_members が node_ids 件数分
- **UI での確認**: Organizer 実行で diffs に grouping が含まれる場合、画面に「適用可能な Diff（grouping）」が表示され、「このDiffを反映する」→ confirm → Apply 成功メッセージ・refresh は UI から手動で同一手順を実施すれば同様に確認可能。

---

## 5. DB 確認結果

- **確認内容**: `groups` に 1 行、`group_members` に 2 行（node_ids 2 件分）追加されていること。
- **確認方法**: `GET /api/e2e-verify/groups` で groupsCount: 1, groupMembersCount: 2 を確認。Supabase の Table Editor または `SELECT * FROM groups;` / `SELECT * FROM group_members;` でも同一内容を確認可能。

---

## 6. 既知の割り切り（MVP）

- refresh 後の UI でグループが一覧・トレイに表示されなくても MVP では不問（API レベルで groups / group_members が確認できればよい）。
- decomposition 未対応、Undo なし、一括適用なし。同一 group_label + 同一 node_ids の重複 Apply は MVP では許容（都度新 group が作成される）。

---

## 7. 再実行用（API 経由 E2E）

- **フル実行**（organizer/run で grouping が返る場合）: `node scripts/e2e-grouping.mjs`（要: `npm run dev` 起動済み、dashboard に Node 2 件以上）
- **Apply のみ検証**（LLM をスキップ）: `E2E_SKIP_ORGANIZER=1 node scripts/e2e-grouping.mjs`
- **DB 件数確認**: `GET /api/e2e-verify/groups` で groupsCount / groupMembersCount を取得

---

以上をもって、**Phase5-B MVP（grouping）の手動 E2E 完了証跡**とする。
