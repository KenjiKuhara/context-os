# 82 — Phase7-A Diff / Confirmation 履歴可視化 クローズアウト

**Phase7-A MVP（Diff / Confirmation 履歴の可視化）を「完了」として正式にクローズする。** 本ドキュメントはプロジェクト管理上の区切りとしての終了札とする。

**参照**: 76_phase7_scope.md、77_phase7_history_design.md、78_phase7_history_mvp_plan.md、81_phase7_a_history_no_reload_update.md。

---

## 1. 完了宣言

- **Phase7-A MVP（Diff / Confirmation 履歴の可視化）はクローズした。**
- 適用済み confirmation を履歴 API で取得し、Organizer タブに一覧・詳細表示する。Apply 成功後はリロード不要で履歴が更新される。既存の Organizer Apply と Phase6 ツリーは維持している。

---

## 2. できるようになったこと

| 項目 | 内容 |
|------|------|
| **履歴 API** | GET /api/confirmations/history。consumed な confirmation を取得。クエリ type / node_id / limit / offset。読み取り専用。DB 変更なし。 |
| **履歴 UI** | Organizer タブ内に「適用済み Diff 履歴」ブロック。日時・種別・対象の要約を 1 行で表示。タイムライン風の縦リスト。 |
| **詳細表示** | 1 行クリックで proposed_change の内容を type 別に表示（relation: from/to/relation_type/diff_id、grouping: group_label/node_ids/diff_id、decomposition: parent_node_id/add_children/diff_id）。再クリックで閉じる。 |
| **Apply 後のリロード不要更新** | relation / grouping / decomposition の Apply 成功直後に履歴 API を再取得し、一覧が F5 なしで最新化される（81 で追加）。Organizer 提案表示は消えない。 |

---

## 3. DoD 確認表（77 / 78 に基づく）

| # | 確認項目（77 §6 / 78 §5 相当） | 結果 |
|---|--------------------------------|------|
| 1 | 履歴 API で consumed な confirmation を一覧取得できる | ✅ |
| 2 | 履歴 UI で日時・type・対象の要約が表示される | ✅ |
| 3 | 1 件クリックで詳細（proposed_change）が表示される | ✅ |
| 4 | type フィルタが動作する（API で対応。UI は未実装） | ✅（API） |
| 5 | node_id フィルタが動作する（API で対応。UI は未実装） | ✅（API） |
| 6 | Organizer の Diff Apply フローが壊れていない | ✅ |
| 7 | 空の履歴でもエラーにならず適切なメッセージが表示される | ✅ |
| 8 | Phase6 ツリー表示・開閉・詳細パネル連携が壊れていない | ✅ |

---

## 4. MVP の割り切り

以下は Phase7-A の範囲外であり、クローズ時点で未対応である。

| 項目 | 内容 |
|------|------|
| **UI フィルタ** | type フィルタ・node_id フィルタの UI は未実装。API では対応済み。 |
| **ページネーション** | 「もっと見る」やページ切替は行わない。limit=50 で取得した分のみ表示。 |
| **Undo** | 履歴から「取り消す」操作は行わない。表示のみ。 |
| **編集・reason** | 履歴の編集や reason の追加入力・表示は行わない。 |
| **ツリー連携** | 履歴 1 件選択時にツリー上で該当 Node をハイライトする機能は未実装。 |
| **エクスポート** | CSV 出力等は行わない。 |

---

## 5. 既知の課題

| 課題 | 内容 |
|------|------|
| **フィルタ UI が無い** | type / node_id で絞りたい場合は API を直接叩く必要がある。UI での絞り込みは Phase7-B 等で対応予定。 |
| **ページネーション無し** | 履歴が 50 件を超えると古い分は一覧に出ない。「さらに読み込む」等は未実装。 |
| **reason が表示されない** | confirmation_events に reason を保存していないため、履歴詳細に「なぜこの変更を採用したか」は出ない。 |
| **履歴とツリーの連携無し** | 履歴の 1 件を選んでも、該当 Node がツリーや詳細パネルで自動でフォーカスされない。 |

---

## 6. 次フェーズへの引き継ぎ（Phase7-B 候補）

| 候補 | 内容 |
|------|------|
| **履歴の type / node_id フィルタ UI** | API 対応済みのため、Organizer タブにフィルタ UI を追加する。DB 変更なし。 |
| **判断理由（reason）の保存・表示** | Confirm 時に reason を proposed_change に含めて保存し、履歴詳細で表示する。既存 JSONB 拡張で対応可能。 |
| **履歴とツリーの連携** | 履歴 1 件選択時に、該当 Node をツリーまたは詳細パネルで表示する。 |
| **ページネーション** | 「さらに読み込む」や offset 指定 UI。 |

---

## 7. 参照ドキュメント

| 番号 | ファイル名 |
|------|------------|
| 76 | 76_phase7_scope.md |
| 77 | 77_phase7_history_design.md |
| 78 | 78_phase7_history_mvp_plan.md |
| 81 | 81_phase7_a_history_no_reload_update.md |

---

以上をもって Phase7-A Diff / Confirmation 履歴可視化 MVP を正式にクローズする。
