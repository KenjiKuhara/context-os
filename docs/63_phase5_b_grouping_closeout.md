# 63 — Phase 5-B grouping クローズアウト

**Phase5-B MVP（grouping Apply）を「完了」として正式にクローズする。** 証跡は 62、手順は 61 を参照する。本ドキュメントはプロジェクト管理上の区切りとしての終了札とする。

---

## 1. 完了宣言

- **Phase5-B MVP（grouping Diff の Apply）は完了した。**
- Organizer 実行で diffs に grouping が含まれる場合、UI に「適用可能な Diff（grouping）」を表示し、1 件選択 → Confirm → Apply → groups / group_members に反映 → refresh、まで実施可能である。API 経由 E2E および DB 確認を 62 に記録した。

---

## 2. Definition of Done チェック（59 準拠）

| # | 条件 | 結果 |
|---|------|------|
| 1 | Organizer 提案で grouping タイプの Diff が 1 件以上 run の `diffs` に含まれる | ✅ |
| 2 | Diff 一覧に VALID と NEEDS_REVIEW の grouping のみ表示され、INVALID は含まれない | ✅ |
| 3 | 1 件選択でプレビュー（group_label・node_ids・reason・risk・注意）が表示される | ✅ |
| 4 | 「この Diff を反映する」→ Confirm → Apply API でグループ情報が DB に 1 件反映される | ✅ |
| 5 | refresh で dashboard が更新され、反映結果が API レベルで確認できる | ✅ |
| 6 | Apply 失敗時はエラーメッセージ表示。NEEDS_REVIEW は「要確認」表示 | ✅ |

**以上を手動 E2E（または API 経由 E2E）で 1 回やり切れた状態で Done とする。** 全項目 OK。

---

## 3. 未対応（MVP 外）の明記

以下は Phase5-B grouping MVP の範囲外であり、クローズ時点で未対応である（61 §6 に準拠）。

| 項目 | 内容 |
|------|------|
| **decomposition** | decomposition_proposals の Diff 変換・表示・Apply は未対応。Phase5-B では grouping のみ実装。 |
| **Undo** | 適用したグループの削除（取り消し）は行わない。 |
| **一括適用** | 複数 Diff を選択して一度に Apply する機能はない。1 Diff ずつ Confirm → Apply。 |
| **重複 group の扱い** | 同一 group_label + 同一 node_ids の「内容が同じ」別 Apply は **MVP では許容**する。その都度新しい group_id で 1 グループが追加される。重複抑制は将来対応。 |
| **refresh 後の UI 描画** | グループが一覧やトレイに視覚的に表示されなくても MVP では不問。API レベルで groups / group_members が取得できればよい。 |

---

**以上をもって Phase5-B grouping MVP をクローズする。**
