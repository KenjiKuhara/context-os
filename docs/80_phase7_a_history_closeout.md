# 80 — Phase7-A Diff / Confirmation 履歴可視化 クローズアウト

**Phase7-A MVP（Diff / Confirmation 履歴の可視化）を「完了」として正式にクローズする。** 証跡は 79_phase7_a_history_e2e_result.md、計画は 78、設計は 77、スコープは 76 を参照する。本ドキュメントはプロジェクト管理上の区切りとしての終了札とする。

---

## 1. 完了宣言

- **Phase7-A MVP（Diff / Confirmation 履歴の可視化）は完了した。**
- GET /api/confirmations/history により適用済み confirmation を取得し、Organizer タブに「適用済み Diff 履歴」ブロックで一覧・詳細表示する。Apply 成功後にリロードなしで履歴が更新される（81 の UX 改善を含む）。77 の Definition of Done に基づく手動確認を 79_phase7_a_history_e2e_result.md に記録した。

---

## 2. できるようになったこと

| 項目 | 内容 |
|------|------|
| **履歴 API** | GET /api/confirmations/history。consumed な confirmation を取得。クエリ type / node_id / limit / offset。読み取り専用。 |
| **履歴 UI** | Organizer タブ内に「適用済み Diff 履歴」を表示。日時・種別・対象の要約を 1 行で表示。1 行クリックで proposed_change の詳細を表示。 |
| **空・エラー時** | 0 件時は「Apply 済みの Diff はまだありません」。API エラー時は「履歴の取得に失敗しました」。 |
| **リロード不要更新** | relation / grouping / decomposition の Apply 成功直後に履歴 API を再取得し、一覧が F5 なしで最新化される（81 で追加）。 |
| **既存フロー維持** | Organizer の提案生成・Diff Apply（relation/grouping/decomposition）は変更なし。Phase6 ツリー表示も維持。 |

---

## 3. MVP としての割り切り

以下は Phase7-A の範囲外であり、クローズ時点で未対応である。

| 項目 | 内容 |
|------|------|
| **UI フィルタ** | type フィルタ・node_id フィルタの UI は未実装。API では対応済み（78 Step5/6 で UI 追加予定）。 |
| **ページネーション** | 履歴一覧の「もっと見る」やページ切替は行わない。limit=50 で取得した分のみ表示。 |
| **Undo** | 履歴から「取り消す」操作は行わない。表示のみ。 |
| **編集・reason** | 履歴の編集や reason の追加入力・表示は行わない。 |
| **ツリー連携** | 履歴の 1 件を選んだときにツリー上で該当 Node をハイライトする機能は未実装。 |
| **エクスポート** | CSV 出力等は行わない。 |

---

## 4. 次フェーズへの引き継ぎ

Phase7-A 完了後、または Phase7 の 2 本目として検討しうるテーマを以下に挙げる。

| 候補 | 内容 |
|------|------|
| **履歴の type / node_id フィルタ UI** | 78 Step5/6。API は対応済みのため、Organizer タブにフィルタ UI を追加する。 |
| **判断理由（reason）の保存・表示** | Confirm 時に reason を proposed_change に含めて保存し、履歴詳細で表示する。 |
| **履歴とツリーの連携** | 履歴 1 件選択時に、該当 Node をツリーまたは詳細パネルで表示する。 |
| **ページネーション** | 履歴が多数の場合の「さらに読み込む」や offset 指定 UI。 |

---

## 5. 参照ドキュメント一覧

| 番号 | ファイル名 |
|------|------------|
| 76 | 76_phase7_scope.md |
| 77 | 77_phase7_history_design.md |
| 78 | 78_phase7_history_mvp_plan.md |
| 79 | 79_phase7_a_history_ui_mvp.md / 79_phase7_a_history_e2e_result.md |
| 81 | 81_phase7_a_history_no_reload_update.md |

---

以上をもって Phase7-A Diff / Confirmation 履歴可視化 MVP をクローズする。
