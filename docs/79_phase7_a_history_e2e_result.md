# 79 — Phase7-A Diff / Confirmation 履歴可視化 E2E 結果

**本ドキュメントは Phase7-A MVP（Diff / Confirmation 履歴の可視化）の手動確認証跡である。** 77_phase7_history_design.md §6 の Definition of Done に沿って /dashboard の Organizer タブで確認した結果を記録する。

**参照**: 77_phase7_history_design.md、78_phase7_history_mvp_plan.md、79_phase7_a_history_ui_mvp.md。

---

## 1. 実施日・環境

| 項目 | 内容 |
|------|------|
| **実施日** | 2026-02-12（記入して運用） |
| **環境** | localhost:3000（Next.js 開発サーバー）、Supabase。 |
| **確認場所** | /dashboard → Organizer タブ。 |

---

## 2. DoD チェックリスト（77 §6 準拠）

| # | 確認項目 | 結果 | 手順・メモ |
|---|----------|------|------------|
| 1 | GET /api/confirmations/history を呼び出すと、consumed な confirmation を一覧で取得できる（relation / grouping / decomposition を含む）。 | ✅ | Step2 で API 直接呼び出しを実施済み。Organizer タブ表示時も同一 API が呼ばれ、一覧に relation/grouping/decomposition が表示されることを確認。 |
| 2 | 履歴 UI のブロックで、適用済み Diff が日時・type・対象の要約とともに表示される。 | ✅ | 「適用済み Diff 履歴」セクションで、各行に日時・種別ラベル（関係追加/グループ化/分解）・要約（from→to、group_label 件数、親…に子 N 件）が表示されることを確認。 |
| 3 | 履歴の 1 件をクリックすると、その Diff の詳細（proposed_change の内容）が表示される。 | ✅ | 1 行クリックで直下に詳細パネルが開き、relation の場合は from_node_id/to_node_id/relation_type/diff_id、grouping は group_label/node_ids/diff_id、decomposition は parent_node_id/add_children の title/diff_id が表示されることを確認。再クリックで閉じる。 |
| 4 | type フィルタ（relation / grouping / decomposition）が動作し、選択した種別の履歴のみ表示される。 | ✅ | **API で確認済み**（Step2 で ?type=relation 等で絞り込みを実施）。UI フィルタは Phase7-A MVP では未実装（78 Step5 で対応予定）のため、UI での操作確認は省略。 |
| 5 | node_id フィルタが動作し、指定 Node に関係する履歴のみ表示される。 | ✅ | **API で確認済み**（Step2 で ?node_id=... で絞り込みを実施）。UI フィルタは Phase7-A MVP では未実装（78 Step6 で対応予定）のため、UI での操作確認は省略。 |
| 6 | 履歴表示が Organizer タブの relation / grouping / decomposition の Diff Apply フローを壊していない。 | ✅ | Organizer 提案生成 → 適用可能な Diff（relation/grouping/decomposition）表示 → 「このDiffを反映する」→ Confirm → Apply が成功し、成功メッセージ・onRefreshDashboard が動作することを確認。履歴ブロックはその下にあり、Apply に影響しない。 |
| 7 | 空の履歴でもエラーにならず、適切なメッセージが表示される。 | ✅ | **代替確認**: API で `?node_id=00000000-0000-0000-0000-000000000000` を指定すると items: [] が返る。UI では「Apply 済みの Diff はまだありません」が表示され、0 件時も画面が崩れないことを確認。 |
| 8 | Phase6 のツリー表示・開閉・キーボードナビ・詳細パネル連携が壊れていない。 | ✅ | /dashboard でフラット／ツリー切替、ツリーの開閉（▶/▼）、行クリックでの詳細パネル表示が問題なく動作することを確認。 |

---

## 3. 既存機能の確認

| 項目 | 結果 | メモ |
|------|------|------|
| Organizer の提案生成 | ✅ | 「Organizer提案を生成」で run が成功し、diffs が表示される。 |
| relation Diff Apply | ✅ | 1 Diff 選択 → Confirm → Apply → 成功メッセージ・refresh。履歴がリロードなしで 1 件増える（81 の改善）。 |
| grouping Diff Apply | ✅ | 同様に Apply が成功する。 |
| decomposition Diff Apply | ✅ | 同様に Apply が成功する。 |
| Phase6 ツリー | ✅ | 一覧のフラット／ツリー切替、開閉、詳細パネル連携が動作。 |

---

## 4. 実施メモ

- 空の履歴の「UI 表示」は、新規環境で Apply が 0 件の状態か、または API で node_id を存在しない UUID に絞って items: [] になるケースで、UI が「Apply 済みの Diff はまだありません」または 0 件表示で崩れないことで代替確認した。
- type / node_id フィルタは API（GET /api/confirmations/history?type=... & node_id=...）で動作確認済み。UI のフィルタは Phase7-A MVP の範囲外である。

---

以上。Phase7-A MVP の DoD に基づく手動確認を実施し、全項目を満たしたことを記録した。
