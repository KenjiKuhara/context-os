# 58 — Phase 5-A クローズアウト

**Phase5-A MVP（relation Apply）を「完了」として正式にクローズする。** 証跡は 56、要約は 57 を参照する。本ドキュメントはプロジェクト管理上の区切りとしての終了札とする。

---

## 1. 完了宣言

- **Phase5-A MVP（relation Diff の Apply）は完了した。**
- Organizer 実行 → relation Diff 表示 → 1 件選択 → Confirm → Apply → relations に 1 行追加 → refresh、まで手動 E2E で実施し、結果を 56 に記録した。57 に完了サマリを残す。

---

## 2. Definition of Done チェック（54 §6 準拠）

| # | 条件 | 結果 |
|---|------|------|
| 1 | Organizer 提案で relation タイプの Diff が 1 件以上 run の `diffs` に含まれる | ✅ |
| 2 | Diff 一覧に VALID と NEEDS_REVIEW の relation のみ表示、INVALID は含まれない | ✅ |
| 3 | 1 件選択でプレビュー（対象・何が変わるか・reason・risk・注意）が表示される | ✅ |
| 4 | 「この Diff を反映する」→ Confirm → Apply API で relation が DB に 1 行追加される | ✅ |
| 5 | refresh で dashboard が更新され、反映結果が確認できる（MVP では API レベルで確認できれば OK） | ✅ |
| 6 | Apply 失敗時はエラーメッセージ表示。INVALID は一覧に出さない。NEEDS_REVIEW は「要確認」表示 | ✅ |

**以上を手動 E2E で 1 回やり切れた状態で Done とする。** 全項目 OK。

---

## 3. 既知の割り切り（MVP 外）

- decomposition / grouping の Diff 変換・表示・Apply は未対応。
- Undo（適用した relation の削除）は未対応。
- 一括適用は未対応（1 件ずつ Confirm → Apply）。
- run 時点の既存 relation 重複チェックは行わない（apply 時の 409 で検出）。
- refresh 後の UI 上での relation 描画（線・一覧）は不問（API で確認できればよい）。

---

## 4. 次に進むルート（Phase5-B）

Phase5-A で確立した「Diff → Confirm → Apply」のパターンを拡張する。候補は次の 2 つ。

| 候補 | 内容 |
|------|------|
| **decomposition** | decomposition_proposals を Diff に変換し、Apply で子 Node 作成・親子紐づけを行う。子 Node 作成 API・トランザクション境界の設計が必要。 |
| **grouping** | grouping_proposals を Diff に変換し、Apply でグループ情報を反映する。グループの DB スキーマ（ラベル・エンティティ等）の決定が必要。 |

どちらを先に着手するかは別途計画する。57 の「Phase5-B への引き継ぎ」を参照。

---

## 5. 次の作業で作るべき docs 一覧（59 以降の候補）

Phase5-B または関連作業に進む際に作成しうるドキュメントを箇条書きする。

- **59_phase5_b_scope.md**（例）— Phase5-B のスコープ（decomposition / grouping のどちらを先にやるか、DoD）。
- **60_phase5_decomposition_schema.md**（例）— decomposition Diff の change 構造・DB 設計（51 の拡張）。
- **61_phase5_grouping_schema.md**（例）— grouping Diff の change 構造・DB 設計（51 の拡張）。
- **62_phase5_b_implementation_plan.md**（例）— Phase5-B の実装順序・Step 一覧（54 と同様の形式）。
- その他、validator 拡張（52 追記）・transform 拡張（53 追記）のメモや E2E チェックリストなど、必要に応じて 63 以降を採番。

※ ファイル名・番号は実際の採番方針に合わせて調整する。

---

**以上をもって Phase5-A をクローズする。**
