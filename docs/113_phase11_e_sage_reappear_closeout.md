# 113 — Phase11-E 大賢者助言 再出現制御 クローズアウト

**Phase11-E（大賢者メッセージの再出現制御）を「完了」として正式にクローズする。**

**参照**: [111_phase11_e_sage_reappear_e2e_plan.md](111_phase11_e_sage_reappear_e2e_plan.md)、[112_phase11_e_sage_reappear_e2e_result.md](112_phase11_e_sage_reappear_e2e_result.md)、[110_phase11_d_sage_message_impl.md](110_phase11_d_sage_message_impl.md)。

**状態管理**: Phase11-E の CLOSED 状態・Evidence・次フェーズ候補・潜在リスクは [114_phase_status.md](114_phase_status.md) に確定記録した。

---

## 1. 完了宣言

- **Phase11-E（大賢者助言の再出現制御）はクローズした。**
- 滞留検知のロジック・閾値・優先順位は変更せず、**同じ kind の助言を直前に対応（クリック）した場合は再表示しない**仕組みを追加した。localStorage に `kuharaos.sage.lastHandled`（kind + timestamp）を保持し、**状態が改善した場合**（いずれの条件も閾値未満になったとき）のみ lastHandled を削除し、再出現を許可する。
- 112 にて手動 E2E を実施し、DoD 全項目および影響なし確認を満たしたことを確認したうえで、本クローズとする。

---

## 2. できるようになったこと

| 項目 | 内容 |
|------|------|
| **同 kind の再表示抑制** | 推奨アクション行をクリックすると、その kind を lastHandled として保存する。同一 kind の候補が再計算されても、lastHandled と一致する間は助言を表示しない。 |
| **状態改善時の再出現許可** | 滞留が解消（needs_decision / in_progress_stale / ready いずれも閾値未満）したとき、localStorage の lastHandled を removeItem する。その後、再度条件を満たしたときに同じ kind の助言が再表示される。 |
| **別 kind の表示** | lastHandled は「同じ kind」のときだけ表示を抑制する。状態が変わり別の kind が候補になった場合は、その kind の助言が表示される。 |
| **localStorage 異常時** | getItem / setItem / removeItem / JSON.parse を try-catch で囲み、空・壊れ・未対応環境でも落ちない。 |

---

## 3. DoD 確認表

| # | 確認観点（111 §2 相当） | 結果 |
|---|-------------------------|------|
| 1 | 同じ kind はクリック後に再表示されない | ✅ |
| 2 | 滞留が解消すると lastHandled が削除され再出現が許可される | ✅ |
| 3 | 別 kind に切り替わるケース | ✅ |
| 4 | localStorage が空／壊れていても落ちない | ✅ |
| 5 | 既存のトレー切替・フォーカス・ハイライトが壊れていない | ✅ |

---

## 4. Phase11-E の割り切り

以下は Phase11-E の範囲外であり、クローズ時点で行わない。

| 項目 | 内容 |
|------|------|
| **実装の拡張** | 再出現制御の仕様を超えた機能追加は行わない。 |
| **閾値変更** | READY_THRESHOLD / NEEDS_DECISION_THRESHOLD / IN_PROGRESS_STALE_MINUTES は変更しない。 |
| **timestamp による自動解除** | localStorage の timestamp は保存するが、経過時間で lastHandled を無効化する処理は行わない。状態改善でのみ削除する。 |

---

## 5. 既知の注意点

- lastHandled は「同じ kind」のみ抑制する。needs_decision をクリックしたあと、ready が候補になれば ready の助言は表示される。
- 滞留が解消しない限り、同じ kind の助言は再表示されない。ユーザーが状態を変更（判断待ちを減らす等）してから再度悪化した場合にのみ再表示される。

---

## 6. 影響なし確認

| 項目 | 確認内容 | 結果（112 §5） |
|------|----------|----------------|
| **Phase11-D 導線** | 助言クリックでトレー切替・フォーカス・展開・ハイライトが動作する。 | ✅ 壊れていない |
| **通常のトレー・一覧操作** | トレーカード・一覧ノードのクリックで従来どおり動作する。 | ✅ 壊れていない |

112 の手動 E2E にて上記を確認した。

---

## 7. 参照ドキュメント

| 番号 | ファイル名 |
|------|------------|
| 110 | 110_phase11_d_sage_message_impl.md |
| 107 | 107_phase11_c_personality_design.md |
| 109 | 109_phase11_c_os_philosophy.md |
| 111 | 111_phase11_e_sage_reappear_e2e_plan.md |
| 112 | 112_phase11_e_sage_reappear_e2e_result.md |
| 114 | 114_phase_status.md（Phase 状態管理・次フェーズ候補・潜在リスク） |

---

## 8. 正式クローズ処理

- **実施日**: 112 の手動 E2E 実施日に合わせてクローズ処理を実施した。
- **状態**: Phase11-E = CLOSED（DONE）。Evidence = 112, 113。Note = 実装変更なし、手動 E2E 結果でクローズ。
- **確定記録**: 上記状態とエビデンス・次フェーズ候補（P0/P1/P2）・追加確認チェック・潜在リスクを [114_phase_status.md](114_phase_status.md) に記載した。今後の判断は 114 を参照する。

以上をもって Phase11-E 大賢者助言の再出現制御を正式にクローズする。
