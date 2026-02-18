# 131 — Phase12-A：直接完了遷移 クローズアウト

Phase12-A（直接完了遷移の導入）を完了とし、CLOSED（DONE）とする宣言。

---

## 完了宣言

Phase12-A は、以下を満たしたため **DONE** とする。

- 目的：どの状態からでも直接「完了」に遷移できるようにする。既存遷移ルールは維持し、完了のみ例外。
- 設計：128 にて状態遷移の例外ルール・影響範囲・E2E 計画を記載。
- 実装：stateMachine（isValidTransition / getValidTransitions）で完了を常に許可。更新中は全状態ボタン非活性・エラーは更新完了後の失敗時のみ表示。
- E2E：129 計画に基づき手動確認。130 に結果を記録し、全シナリオ ✅ で E2E 合格とする。

---

## 変更範囲（最小）

- **src/lib/stateMachine.ts**: `isValidTransition` に「to === DONE かつ from が非終了なら true」を追加。`getValidTransitions` に非終了状態で DONE を追加。
- **src/components/StatusQuickSwitch.tsx**: `buttonsDisabled` プロパティを追加。true のとき全ボタン非活性。
- **src/app/dashboard/page.tsx**: `quickSwitchInFlightNodeId` を追加。送信開始でセット、完了/失敗でクリア。StatusQuickSwitch に `buttonsDisabled={quickSwitchInFlightNodeId === selected.id}` を渡す。

DB / API は変更していない（estimate-status は stateMachine を参照するため、コード変更のみで「任意 → DONE」が許可される）。

---

## Exit Criteria 対応

| # | 条件 | 対応 |
|---|------|------|
| 1 | 「完了」が現在状態でない限り常に押せる | getValidTransitions で非終了状態に DONE を追加。 |
| 2 | 任意の非終了状態から「完了」へ遷移できる | isValidTransition で to===DONE かつ from が非終了なら true。 |
| 3 | 履歴に通常どおり status_change が記録される | 既存 API のまま。変更なし。 |
| 4 | 更新中はボタンが非活性。失敗時のみエラーメッセージ表示 | buttonsDisabled で更新中は全ボタン非活性。エラーは .catch でのみ setQuickSwitchError。 |
| 5 | 「中止」および終了状態からの遷移は既存どおり | TRANSITIONS は変更せず、例外は DONE のみ。 |
| 6 | DB スキーマ変更なし | 変更なし。 |

---

## 参照

| 番号 | ファイル名 |
|------|------------|
| 128 | 128_phase12_a_direct_done_design.md（設計・影響範囲・E2E 計画） |
| 129 | 129_phase12_a_direct_done_e2e_plan.md（E2E 計画） |
| 130 | 130_phase12_a_direct_done_e2e_result.md（E2E 結果） |
| 114 | 114_phase_status.md（Phase 状態管理） |

---

以上。Phase12-A 直接完了遷移を CLOSED（DONE）とした。
