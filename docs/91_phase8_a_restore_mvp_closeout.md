# 91 — Phase8-A 履歴→Apply候補の再表示（復元）MVP クローズアウト

**Phase8-A MVP（履歴の proposed_change を Apply 候補として再表示・復元）を「完了」として正式にクローズする。**

**参照**: 89_phase8_a_restore_mvp_e2e_plan.md、90_phase8_a_restore_mvp_e2e_result.md、Phase8-A 設計（plan）。

---

## 1. 完了宣言

- **Phase8-A MVP（履歴→Apply候補の再表示・復元）はクローズした。**
- 履歴詳細に「この変更内容をApply候補として再表示する」ボタンを追加し、復元した 1 件を既存の適用可能 Diff UI に流し込んだ。DB 変更・Apply API 変更は行わず、ProposalPanel の state と UI の追加のみで実現している。
- 90 にて手動 E2E を実施し、DoD 全項目および影響なし確認を満たしたことを確認したうえで、本クローズとする。

---

## 2. できるようになったこと

| 項目 | 内容 |
|------|------|
| **履歴詳細の再表示ボタン** | 履歴 1 件を選択して詳細を表示したとき、type が relation / grouping / decomposition であれば「この変更内容をApply候補として再表示する」ボタンが表示される。 |
| **復元した Apply 候補の 1 件表示** | ボタンクリックで「復元した Apply 候補」として 1 ブロックが表示され、既存の適用可能 Diff と同じ見た目で内容が確認できる。 |
| **既存 Apply フローでの適用** | 復元カードの「このDiffを反映する」で既存の apply*Diff を呼び、POST /api/confirmations → POST /api/diffs/*/apply が実行される。 |
| **Apply 成功後の復元クリア・履歴再取得** | Apply 成功時に setRestoredDiff(null) で復元ブロックが消え、fetchHistory(true) で一覧が F5 なしで更新される。手動「クリア」でも復元表示は消える。 |

---

## 3. DoD 確認表

| # | 確認項目（89 §2 相当） | 結果 |
|---|------------------------|------|
| 1 | 履歴詳細で relation/grouping/decomposition のとき再表示ボタンが表示される | ✅ |
| 2 | ボタンクリックで復元した Apply 候補が 1 件表示され、内容が確認できる | ✅ |
| 3 | 復元カードの「このDiffを反映する」で既存 Apply フローが動き、成功時にダッシュボード更新・履歴再取得される | ✅ |
| 4 | Apply 成功後、復元表示が消える | ✅ |
| 5 | Organizer の適用可能 Diff と Phase6 ツリーに影響しない | ✅ |

---

## 4. MVP の割り切り

以下は Phase8-A の範囲外であり、クローズ時点で一切行わない。

| 項目 | 内容 |
|------|------|
| **DB 変更** | confirmation_events 等のスキーマ・API は変更しない。 |
| **Apply API 変更** | POST /api/confirmations、POST /api/diffs/*/apply の仕様は変更しない。 |
| **複数件復元** | 復元は常に 1 件のみ。複数件を同時に復元する機能は行わない。 |
| **Undo** | 履歴から「取り消す」操作は行わない。 |
| **ページネーション** | 履歴の「さらに読み込む」等は本 MVP では扱わない。 |
| **履歴の編集・reason 表示拡張** | 履歴の編集や reason の追加入力・表示の拡張は行わない。 |

---

## 5. 既知の落とし穴（要約）

クローズ後も注意事項として残す。

| # | 落とし穴 | 要約 |
|---|----------|------|
| 1 | **重複適用** | 同じ履歴を復元して再度 Apply すると、既に適用済みでも新規 confirmation が作られ再度 Apply される。Undo はしない意図的な仕様。 |
| 2 | **diff_id 欠損時** | proposed_change に diff_id が無い場合は `restored-${confirmation_id}` で復元。古い履歴でも復元・Apply 可能。 |
| 3 | **type / node_id フィルタ状態維持** | 復元→Apply 後も fetchHistory は現在の filterType / nodeIdFilter を維持して再取得する。 |
| 4 | **Apply 成功後の履歴リロード不要更新** | 復元を Apply した場合も fetchHistory(true) により F5 なしで履歴が更新される。 |
| 5 | **復元候補の自動クリア** | Apply 成功時および手動「クリア」で復元ブロックが消える。 |
| 6 | **Phase6 ツリー非影響** | 復元・Apply は ProposalPanel 内のみ。ツリー・フラット切替・開閉・詳細・Phase7-C 連携には影響しない。 |

---

## 7. 影響なし確認

| 項目 | 確認内容 | 結果（90 §5） |
|------|----------|----------------|
| **Phase6 ツリー** | /dashboard でフラット／ツリー切替、開閉、詳細パネル連携が問題なく動作する。 | ✅ 壊れていない |
| **既存 Organizer Apply** | Organizer 提案生成 → 適用可能 Diff の「このDiffを反映する」→ Confirm → Apply が成功する。 | ✅ 壊れていない |

90 の手動 E2E にて上記を確認した。

---

## 8. 参照ドキュメント

| 番号 | ファイル名 |
|------|------------|
| 89 | 89_phase8_a_restore_mvp_e2e_plan.md |
| 90 | 90_phase8_a_restore_mvp_e2e_result.md |
| — | Phase8-A 設計（plan） |

---

以上をもって Phase8-A 履歴→Apply候補の再表示（復元）MVP をクローズする。
