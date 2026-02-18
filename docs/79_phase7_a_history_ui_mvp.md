# 79 — Phase7-A 履歴 UI MVP（Step3 / Step4）

Phase7-A「Diff / Confirmation 履歴可視化」の Step3・Step4 で追加した UI の仕様と手動確認チェックリストを記録する。

**前提**: 77_phase7_history_design.md、78_phase7_history_mvp_plan.md。GET /api/confirmations/history は実装済み。

---

## 1. 追加した内容（ファイル一覧）

| ファイル | 変更内容 |
|----------|----------|
| `src/components/ProposalPanel.tsx` | Organizer タブ内に「適用済み Diff 履歴」ブロックを追加。初期表示時に GET /api/confirmations/history?limit=50 を呼び出し、タイムライン風の縦リストで表示。1 行クリックで詳細表示（選択 state で開閉）。 |

**触っていないファイル**: Apply API、confirmation 発行、dashboard、TreeList、その他コンポーネント。

---

## 2. UI の仕様

### 2.1 配置

- Organizer タブ内で、既存の「適用可能な Diff（relation / grouping / decomposition）」ブロックの**下**に配置する。
- セクション見出し: **適用済み Diff 履歴**。

### 2.2 一覧の 1 行に表示する情報

| 項目 | 内容 |
|------|------|
| **日時** | consumed_at があればそれ、なければ confirmed_at。表示形式は `YYYY-MM-DD HH:mm:ss` 相当（ISO の先頭 19 文字を T → 空白に置換）。 |
| **種別** | relation → 「関係追加」、grouping → 「グループ化」、decomposition → 「分解」。 |
| **対象の要約** | relation: `from_node_id（先頭8文字）… → to_node_id（先頭8文字）…` + relation_type。grouping: group_label + `（N件）`（node_ids.length）。decomposition: `親 parent_node_id（先頭8文字）… に子 N件`（add_children.length）。 |

### 2.3 詳細表示（1 行クリック時）

- 選択中の confirmation_id を state で保持する。
- 同じ行を再クリックすると詳細を閉じる（トグル）。
- 詳細パネルは、その行の直下に折りたたみ表示する。
- **relation**: from_node_id / to_node_id / relation_type / diff_id を 1 行ずつ表示。
- **grouping**: group_label / node_ids 一覧 / diff_id を表示。
- **decomposition**: parent_node_id / add_children の各 title / diff_id を表示。
- reason は表示しない（API に含まれない前提）。

### 2.4 空・エラー時

- **items が空**: 「Apply 済みの Diff はまだありません」と表示。
- **API エラー**: 「履歴の取得に失敗しました」と表示。console.error でエラーを出力する。

### 2.5 未実装（Step5/6 以降）

- type フィルタ UI はまだない。
- node_id フィルタ UI はまだない。
- ページネーションはまだない。

---

## 3. 手動確認チェックリスト

実装確認用に以下を手動で 1 回実施する。

| # | 確認項目 | 期待結果 |
|---|----------|----------|
| 1 | Organizer タブを開いたとき、セクション「適用済み Diff 履歴」が表示される | 見出しと一覧（または空/エラー表示）が表示される。 |
| 2 | 履歴が 1 件以上あるとき、日時・種別・対象の要約が 1 行に表示される | タイムライン風の縦リストで、relation/grouping/decomposition のいずれかが読める。 |
| 3 | 履歴が 0 件のとき、「Apply 済みの Diff はまだありません」と表示される | エラーにならず、該当メッセージが表示される。 |
| 4 | API が失敗したとき（例: オフライン）、「履歴の取得に失敗しました」と表示される | エラーメッセージが表示される（必要に応じて DevTools でネットワークをオフにして確認）。 |
| 5 | 履歴の 1 行をクリックすると、その行の詳細（proposed_change の内容）が表示される。同じ行を再クリックすると詳細が閉じる | 詳細が開閉する。relation なら from/to/relation_type/diff_id、grouping なら group_label/node_ids/diff_id、decomposition なら parent_node_id/add_children の title/diff_id が読める。 |
| 6 | 既存の Organizer の Diff Apply（relation / grouping / decomposition の「このDiffを反映する」）が従来どおり動作する | Organizer run → 1 Diff 選択 → Confirm → Apply が成功し、成功メッセージ・refresh が動作する。 |
| 7 | Phase6 のツリー表示（フラット／ツリー切替、開閉、詳細パネル連携）が壊れていない | Dashboard でツリー・開閉・詳細が問題なく動作する。 |

---

以上。Step3・Step4 の UI 追加内容と確認チェックリストを記録した。
