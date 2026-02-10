# 62 — Phase 5-B grouping Diff Apply 手動 E2E 結果

**本ドキュメントは Phase5-B MVP（grouping）の完了証跡である。** grouping Diff の「生成 → 表示 → Confirm → Apply → refresh」を手動で一通り実施し、その結果を記録する。

**参照**: 61_phase5_grouping_diff_apply_implementation.md（手順・定義）、59_phase5_b_mvp_plan.md、60_phase5_grouping_data_model.md。

---

## 1. 実施日

- **実施日**: 2025-02-10

---

## 2. 実施環境

| 項目 | 内容 |
|------|------|
| **フロント／API** | localhost:3000（Next.js 開発サーバー） |
| **DB** | Supabase。`groups` と `group_members` テーブルがマイグレーション（20260209_create_groups.sql）済みであること。 |

---

## 3. 手動 E2E 手順（簡潔）

1. ダッシュボードに Node を 2 つ以上用意する。
2. Organizer タブで「提案を生成」を実行する。
3. レスポンスの `diffs` に **grouping** が含まれ、タブに「適用可能な Diff（grouping）」ブロックが表示されることを確認する。
4. 1 件の grouping Diff で「このDiffを反映する」をクリックし、確認ダイアログで OK する。
5. 適用中はボタンが「適用中…」等になり、二重クリックできないことを確認する。
6. 成功メッセージが出て dashboard が再取得されることを確認する。
7. DB で `groups` に 1 行、`group_members` に該当 node_ids 分の行が追加されていることを確認する（または GET /api/e2e-verify/groups で確認）。
8. （任意）同じ confirmation で再送すると 409（confirmation already consumed）となることを確認する。

**実施時の事実**: Organizer/run で LLM が grouping_proposals を返さない場合、Apply 経路の検証として `E2E_SKIP_ORGANIZER=1 node scripts/e2e-grouping.mjs` で fixture を用いた API 経由 E2E を実施した。confirmations 発行 → apply → DB 確認まで問題なく完了した。

---

## 4. 結果

- **結果**: **成功**
- 上記手順に沿い、Confirmations（grouping）発行 → Apply API → dashboard 再取得（UI 実施時）まで実施した。API 経由では apply が 200 で applied: true / group_id を返し、DB に groups 1 行・group_members が node_ids 件数分追加されたことを確認した。

---

## 5. DB 確認結果

- **確認内容**: `groups` テーブルに 1 行、`group_members` テーブルに該当 node_ids 件数分の行が追加されていること。
- **確認方法**: GET /api/e2e-verify/groups で groupsCount: 1、groupMembersCount: 2（node_ids 2 件のとき）を確認した。Supabase の Table Editor または `SELECT * FROM groups ORDER BY created_at DESC LIMIT 1;` と `SELECT * FROM group_members WHERE group_id = ?;` でも同一内容を確認できる。

---

## 6. 既知の割り切り（MVP の範囲）

以下は Phase5-B MVP の仕様として「未対応」「不問」であることを記録する（61 §6 に準拠）。

| 項目 | 内容 |
|------|------|
| **decomposition** | decomposition_proposals の Diff 変換・表示・Apply は未対応。Phase5-B では grouping のみ。 |
| **Undo** | 適用したグループの削除（取り消し）は行わない。 |
| **一括適用** | 複数 Diff を選択して一度に Apply する機能はない。1 Diff ずつ Confirm → Apply。 |
| **重複 group の扱い** | 同一 group_label + 同一 node_ids の「内容が同じ」別 Apply は **MVP では許容**する。その都度新しい group_id で 1 グループが追加される。重複抑制は将来対応。 |
| **refresh 後の UI 描画** | グループが一覧やトレイに視覚的に表示されなくても MVP では不問。API レベルで groups / group_members が取得できればよい。 |

---

以上をもって、**Phase5-B MVP（grouping Diff Apply）の手動 E2E 完了証跡**とする。
