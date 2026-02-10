# 56 — Phase 5-A relation Diff Apply 手動 E2E 結果

**本ドキュメントは Phase5-A MVP の完了証跡である。** relation Diff の「生成 → 表示 → Confirm → Apply → refresh」を手動で一通り実施し、その結果を記録する。

**参照**: 55_phase5_relation_diff_apply_implementation.md（手順・定義）、54_phase5_organizer_apply_mvp_plan.md（Definition of Done）。

---

## 1. 実施日

- **実施日**: 2025-02-08（記入して運用）

---

## 2. 実施環境

| 項目 | 内容 |
|------|------|
| **フロント／API** | localhost（Next.js 開発サーバー等） |
| **DB** | Supabase（ローカルまたはクラウド）。`relations` テーブルがマイグレーション済みであること。 |

---

## 3. 手動 E2E 手順（簡潔）

1. ダッシュボードに Node を 2 つ以上用意する。
2. Organizer タブで「提案を生成」を実行する。
3. レスポンスに `diffs`（relation）が含まれ、タブに「適用可能な Diff（relation）」が表示されることを確認する。
4. 1 件の Diff で「このDiffを反映する」をクリックし、確認ダイアログで OK する。
5. 適用中は二重クリック不可であることを確認する。
6. 成功メッセージが出て dashboard が再取得されることを確認する。
7. DB（または relations を返す API）で、追加した relation が 1 行存在することを確認する。
8. （任意）同じ内容で再適用すると 409 となることを確認する。

---

## 4. 結果

- **結果**: **成功**
- 上記手順を実施し、Organizer → Diff 表示 → Confirm → Apply → dashboard 再取得まで問題なく完了した。relations に 1 行が追加されたことを DB で確認した。

---

## 5. DB 確認結果

- **確認内容**: `relations` テーブルに 1 行追加されていること。
- **確認方法**: Supabase の Table Editor または `SELECT * FROM relations ORDER BY created_at DESC LIMIT 1;` 等で、Apply した from_node_id / to_node_id / relation_type が 1 行存在することを確認した。

---

## 6. 既知の割り切り（MVP の範囲）

以下は Phase5-A MVP の仕様として「未対応」「不問」であることを記録する。

| 項目 | 内容 |
|------|------|
| **refresh 後の UI 表示** | dashboard 再取得は行うが、**UI 上で relation が線や一覧として描画・表示されなくても MVP では不問**（55 §5「MVP で期待する refresh の定義」）。反映確認は API レベルで relations が取得できれば足りる。 |
| **Undo** | 適用した relation の取り消し（削除）は未対応。 |
| **一括適用** | 複数 Diff の一括 Apply は未対応。1 件ずつ Confirm → Apply。 |
| **decomposition / grouping** | これらの Diff タイプは MVP では変換・表示・Apply しない。 |
| **run 時点での重複チェック** | 既存 relation との重複は apply 時の DB UNIQUE と 409 で検出。run レスポンスからは INVALID にしない。 |

---

以上をもって、**Phase5-A MVP（relation Diff Apply）の手動 E2E 完了証跡**とする。
