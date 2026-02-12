# 89 — Phase8-A 履歴→Apply候補の再表示（復元）MVP E2E 計画

Phase8-A MVP（履歴の proposed_change を Apply 候補として再表示・復元）を手動 E2E で検証するための計画。DoD チェックリストと既知の落とし穴を整理する。

**参照**: Phase8-A 設計（plan）、[ProposalPanel.tsx](src/components/ProposalPanel.tsx)、81_phase7_a_history_no_reload_update.md、87_phase7_b_filter_ui_closeout.md。

---

## 1. 対象

Phase8-A で追加した以下 3 点を手動 E2E で確認する。DB 変更・Apply API 変更は行っていない。

| 項目 | 内容 |
|------|------|
| **履歴詳細の再表示ボタン** | 履歴 1 件を選択して詳細表示したとき、proposed_change が relation / grouping / decomposition のいずれかであれば「この変更内容をApply候補として再表示する」ボタンが表示される。 |
| **復元した Apply 候補ブロック** | ボタンクリックで「復元した Apply 候補」として 1 件が表示され、既存の適用可能 Diff と同じ見た目で内容が確認できる。Apply は既存の apply*Diff に渡すだけ。 |
| **Apply 成功時の復元クリア** | 復元した 1 件を「このDiffを反映する」で Apply して成功すると、復元ブロックが消える。手動「クリア」でも消える。 |

---

## 2. DoD（手動 E2E チェックリスト）

| # | 確認項目 | 手順・期待結果 |
|---|----------|----------------|
| 1 | **再表示ボタンが表示される** | 履歴 1 件を選択して詳細を開く。proposed_change の type が relation / grouping / decomposition のいずれかであれば、「この変更内容をApply候補として再表示する」ボタンが表示される。 |
| 2 | **復元で 1 件表示される** | 上記ボタンをクリックする。→ 「復元した Apply 候補（relation / grouping / decomposition）」として 1 ブロックが表示され、既存の適用可能 Diff と同じ見た目で内容（relation なら from/to/relation_type 等）が確認できる。 |
| 3 | **復元カードから Apply が動く** | 復元カードの「このDiffを反映する」をクリックする。→ 確認ダイアログ → POST /api/confirmations → POST /api/diffs/*/apply の既存フローが実行され、成功時にダッシュボード更新・履歴再取得が行われる。 |
| 4 | **Apply 成功後、復元表示が消える** | 復元した 1 件を Apply して成功する。→ 復元ブロックが消え、履歴一覧が F5 なしで 1 件増えて表示される。 |
| 5 | **既存機能に影響しない** | Organizer の「適用可能な Diff」表示と Apply は従来どおり動作する。Phase6 ツリー・フラット切替・開閉・詳細パネルは影響を受けない。 |

---

## 3. 既知の落とし穴（確認時の注意点）

E2E 実施時に気をつける点をまとめる。

| 落とし穴 | 内容 | 確認のコツ |
|----------|------|------------|
| **重複適用** | 同じ履歴を復元して再度 Apply すると、内容が既に適用済みでも新規 confirmation が作られ再度 Apply される。意図的な仕様（Undo はしない）。 | 二重適用しても API は受け付けるが、業務上重複になる可能性があることを認識する。 |
| **diff_id 欠損時** | 履歴の proposed_change に diff_id が無い場合は `restored-${confirmation_id}` で復元する。Apply 時もこの値が proposed_change.diff_id として送られる。 | diff_id が保存されていない古い履歴でも復元・Apply ができることを確認する。 |
| **type / node_id フィルタ状態維持** | 履歴ブロックで種別・node_id フィルタをかけた状態で復元→Apply しても、Apply 成功後の fetchHistory は現在の filterType / nodeIdFilter を維持したまま再取得する（Phase7-B 挙動）。 | フィルタが勝手にクリアされないことを確認する。 |
| **Apply 成功後の履歴リロード不要更新** | 復元候補を Apply した場合も、Apply 成功後に fetchHistory(true) が呼ばれ、一覧が F5 なしで更新される（81 と同じ）。 | リロード不要で履歴が 1 件増えることを確認する。 |
| **復元候補の自動クリア** | 復元した 1 件を「このDiffを反映する」で Apply して成功すると setRestoredDiff(null) により復元ブロックが消える。手動「クリア」でも消える。 | 両方の経路（Apply 成功・クリア押下）で復元表示が消えることを確認する。 |
| **Phase6 ツリー非影響** | 復元・Apply は ProposalPanel 内の state と既存 Apply フローのみ。Dashboard のツリー・フラット切替・開閉・詳細パネル・Phase7-C の履歴→ツリー連携には影響しない。 | /dashboard でツリー操作が問題ないことを確認する。 |

---

## 4. 本 MVP で行わないこと（割り切り）

以下は Phase8-A の範囲外であり、一切行わない。

| 項目 | 内容 |
|------|------|
| **DB 変更** | confirmation_events 等のスキーマ・API は変更しない。 |
| **Apply API 変更** | POST /api/confirmations、POST /api/diffs/*/apply の仕様は変更しない。 |
| **複数件復元** | 復元は常に 1 件のみ。複数件を同時に復元して一覧表示する機能は行わない。 |
| **Undo** | 履歴から「取り消す」操作は行わない。再表示→Apply は「同じ内容を再度適用する」だけ。 |
| **ページネーション** | 履歴の「さらに読み込む」等は本 MVP では扱わない。既存の limit 取得のまま。 |
| **履歴の編集・reason 表示拡張** | 履歴の編集や reason の追加入力・表示の拡張は行わない。 |

---

## 5. 参照ドキュメント

| 番号 | ファイル名・内容 |
|------|------------------|
| Phase8-A 設計 | Phase8-A 履歴の再表示 MVP 設計（plan） |
| 81 | 81_phase7_a_history_no_reload_update.md（Apply 後の履歴更新） |
| 87 | 87_phase7_b_filter_ui_closeout.md（Phase7-B クローズ） |

---

以上。Phase8-A MVP の手動 E2E は本計画の DoD と既知の落とし穴に沿って実施し、結果は 90 に記録する。
