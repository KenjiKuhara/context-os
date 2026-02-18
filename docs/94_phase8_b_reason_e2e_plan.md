# 94 — Phase8-B reason 保存・履歴表示 手動 E2E 計画

Phase8-B（reason の保存と履歴表示）を手動 E2E で検証するための計画。DoD チェックリストを整理する。

**参照**: 92_phase8_b_reason_mvp_design.md、93_phase8_b_reason_mvp_plan.md、[ProposalPanel.tsx](src/components/ProposalPanel.tsx)。

---

## 1. 対象

Phase8-B で追加した以下 2 点を手動 E2E で確認する。DB スキーマ・Apply API は変更していない。

| 項目 | 内容 |
|------|------|
| **Apply 時の「理由（任意）」入力と POST への reason 付与** | relation / grouping / decomposition の各 Apply カードおよび復元した Apply 候補カードに「理由（任意）」欄を追加。Apply 時にその値を POST /api/confirmations の body.reason として送り、proposed_change.reason に保存する。 |
| **履歴詳細での reason 表示** | 履歴 1 件の詳細を開いたとき、proposed_change.reason が存在しかつ空でない場合に「理由: {value}」を表示する。既存履歴（reason なし）では「理由」行を出さない。 |

---

## 2. DoD（手動 E2E チェックリスト）

| # | 確認項目 | 手順・期待結果 |
|---|----------|----------------|
| 1 | **理由未入力で Apply** | 「理由（任意）」を空のまま、relation / grouping / decomposition のいずれかを Apply する。→ Apply が成功し、履歴に 1 件追加される。履歴詳細を開いても「理由」行は表示されない（空のため表示しない）。 |
| 2 | **理由入力ありで Apply** | 「理由（任意）」に文字（例: 「テスト理由」）を入力し、該当 Diff を Apply する。→ 成功後、その履歴の詳細を開くと「理由: テスト理由」が表示される。 |
| 3 | **復元 Apply 時の理由** | 履歴から 1 件を復元し、復元カードの「理由（任意）」に入力して「このDiffを反映する」を実行する。→ 成功後、新規に追加された履歴の詳細で、入力した理由が表示される。 |
| 4 | **既存履歴（reason なし）の表示** | Phase8-B 実装前に保存された履歴（proposed_change に reason がない、または空）の詳細を開く。→ 「理由」行は表示されず、from_node_id 等の既存表示のみ出る。エラーにならない。 |
| 5 | **既存 Apply フロー非破壊** | Organizer で提案生成 → 適用可能 Diff の「このDiffを反映する」→ 確認ダイアログ → Apply。理由入力の有無にかかわらず成功する。Phase8-A の復元→Apply も従来どおり動作する。 |

---

## 3. 本 MVP で行わないこと（割り切り）

以下は Phase8-B の範囲外であり、一切行わない。

| 項目 | 内容 |
|------|------|
| **reason の編集・削除** | 保存済み reason の編集や削除機能は行わない。 |
| **reason での検索** | 履歴を reason で絞り込む機能は行わない。 |
| **status_change への reason** | status_change の proposed_change に reason を追加する対応は行わない。 |
| **ページネーション** | 履歴の「さらに読み込む」等は行わない。 |

---

## 4. 参照ドキュメント

| 番号 | ファイル名 |
|------|------------|
| 92 | 92_phase8_b_reason_mvp_design.md |
| 93 | 93_phase8_b_reason_mvp_plan.md |

---

以上。Phase8-B reason 保存・履歴表示の手動 E2E は本計画の DoD に沿って実施し、結果は 95 に記録する。
