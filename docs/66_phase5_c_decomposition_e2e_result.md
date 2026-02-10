# 66 — Phase 5-C decomposition Diff Apply E2E 結果

**本ドキュメントは Phase5-C MVP（decomposition）の完了証跡用である。** decomposition Diff の「生成 → 表示 → Confirm → Apply → refresh」を手動または API 経由で実施し、その結果を記録する。

**参照**: 65_phase5_c_decomposition_apply_implementation.md、64_phase5_c_decomposition_data_model.md。

---

## 1. 実施日

- **実施日**: （実施後に記入）

---

## 2. 実施環境

| 項目 | 内容 |
|------|------|
| **フロント／API** | localhost:3000（Next.js 開発サーバー） |
| **DB** | Supabase。`node_children` テーブルがマイグレーション（20260210_create_node_children.sql）済み。 |
| **実施方法** | 65 §5 に沿い、API 経由 E2E スクリプト（`scripts/e2e-decomposition.mjs`）で確認。必要に応じて UI からも同一手順を実施可能。 |

---

## 3. 手動 E2E 手順（簡潔）

1. ダッシュボードに親となる Node を 1 件以上用意する。
2. Organizer タブで「提案を生成」を実行する。
3. レスポンスの `diffs` に **decomposition** が含まれ、タブに「適用可能な Diff（decomposition）」ブロックが表示されることを確認する（LLM が decomposition_proposals を返さない場合は API E2E を必須とする）。
4. 1 件の decomposition Diff で「このDiffを反映する」をクリックし、確認ダイアログで OK する。
5. 適用中はボタンが「適用中…」等になり、二重クリックできないことを確認する。
6. 成功メッセージが出て dashboard が再取得されることを確認する。
7. DB で `nodes` に子が増え、`node_children` に parent-child が増えたことを確認する（または GET /api/e2e-verify/decomposition で確認）。

---

## 4. 結果

- **結果**: （実施後に「成功」等を記入）
- **実施内容**:
  - （手動 E2E または E2E_SKIP_ORGANIZER=1 で scripts/e2e-decomposition.mjs 実行結果を記録）
- **最低限確認した項目（65 §5 相当）**:
  - [ ] confirmations（decomposition）発行 → confirmation_id 取得
  - [ ] Apply API 成功（200、applied: true、created_children）
  - [ ] refresh 相当
  - [ ] DB に nodes 増分 + node_children が子件数分

---

## 5. DB 確認結果

- **確認方法**: `GET /api/e2e-verify/decomposition` で nodesCount / nodeChildrenCount を確認。Apply 後は node_children が子件数分増えていること。

---

## 6. 再実行用（API 経由 E2E）

- **フル実行**（organizer/run で decomposition が返る場合）: `node scripts/e2e-decomposition.mjs`（要: `npm run dev` 起動済み、dashboard に Node 1 件以上）
- **Apply のみ検証**（LLM をスキップ）: `E2E_SKIP_ORGANIZER=1 node scripts/e2e-decomposition.mjs`
- **DB 件数確認**: `GET /api/e2e-verify/decomposition` で nodesCount / nodeChildrenCount を取得

---

以上をもって、**Phase5-C MVP（decomposition）の E2E 完了証跡**とする（実施後に本ドキュメントを更新すること）。
