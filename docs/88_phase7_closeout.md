# 88 — Phase7 クローズアウト

**Phase7 を Phase7-A および Phase7-B の完了をもって「完了」と宣言し、正式にクローズする。**

**参照**: 76_phase7_scope.md、82_phase7_a_history_closeout.md、87_phase7_b_filter_ui_closeout.md、83_phase7_summary.md。

---

## 1. 完了宣言

- **Phase7 は A/B をもって完了とする。**
- Phase7-A で Diff / Confirmation 履歴の可視化（API・一覧・詳細・Apply 後のリロード不要更新）を実装した。Phase7-B で履歴の type / node_id フィルタ UI を実装し、意思決定を辿れる OS の第一歩を達成した。

---

## 2. できるようになったこと

| 項目 | 内容 |
|------|------|
| **履歴 API** | GET /api/confirmations/history。consumed な confirmation を取得。type / node_id / limit / offset のクエリに対応。読み取り専用。 |
| **履歴 UI** | Organizer タブに「適用済み Diff 履歴」を表示。日時・種別・対象の要約を 1 行で表示。1 行クリックで proposed_change の詳細を表示。 |
| **リロード不要更新** | relation / grouping / decomposition の Apply 成功直後に履歴を再取得し、F5 なしで一覧が最新化される。 |
| **type フィルタ（UI）** | 種別セレクト（すべて / 関連 / グループ化 / 分解）で履歴を絞り込める。 |
| **node_id フィルタ（UI）** | node_id 入力欄で UUID を指定し「絞り込む」で、その Node に関係する履歴のみ表示する。 |
| **UUID バリデーション** | 不正な node_id の場合は API を呼ばず「UUID形式ではありません」を表示する。 |
| **0 件時メッセージ出し分け** | フィルタありで 0 件は「該当する履歴がありません」、フィルタなしで 0 件は「Apply 済みの Diff はまだありません」。 |

---

## 3. Phase7 としての DoD（簡易）

| # | 確認項目 | 結果 |
|---|----------|------|
| 1 | 履歴 API で適用済み confirmation を一覧取得できる | ✅ |
| 2 | Organizer タブで履歴一覧・詳細表示が動作する | ✅ |
| 3 | Apply 成功後にリロードなしで履歴が更新される | ✅ |
| 4 | 種別・node_id で UI から履歴を絞り込める | ✅ |
| 5 | Phase6 ツリー・既存 Apply フローが壊れていない | ✅ |

---

## 4. MVP の割り切り

以下は Phase7 の範囲外であり、未対応のままクローズする。

| 項目 | 内容 |
|------|------|
| **Undo** | 履歴から「取り消す」操作は行わない。 |
| **reason** | 履歴詳細に reason を表示する機能は行わない。保存・表示は別フェーズ。 |
| **ページネーション** | 「さらに読み込む」等は行わない。limit=50 で取得した分のみ表示。 |
| **ツリー連携** | 履歴 1 件選択時に該当 Node をツリー/詳細でフォーカスする機能は行わない。 |
| **エクスポート** | 履歴の CSV 出力等は行わない。 |

---

## 5. 次フェーズ候補（優先度付き）

| 優先度 | 候補 | 内容 |
|--------|------|------|
| **1** | **履歴→ツリー/詳細へジャンプ（連携）** | 履歴 1 件選択時に、該当 Node をダッシュボードのツリーまたは詳細パネルで表示する。ProposalPanel と Dashboard の連携を設計する。 |
| **2** | **reason 保存・表示** | Confirm 時に reason を proposed_change に含めて保存し、履歴詳細で表示する。既存 JSONB 拡張で対応可能。 |
| **3** | **ページネーション UI** | 履歴が多数の場合の「さらに読み込む」や offset 指定。API は対応済み。 |

---

## 6. 参照ドキュメント

| 番号 | ファイル名 |
|------|------------|
| 76 | 76_phase7_scope.md |
| 82 | 82_phase7_a_history_closeout.md |
| 83 | 83_phase7_summary.md |
| 86 | 86_phase7_b_filter_ui_e2e_result.md |
| 87 | 87_phase7_b_filter_ui_closeout.md |

---

以上をもって Phase7 をクローズする。
