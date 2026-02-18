# 81 — Phase7-A 履歴のリロード不要更新（UX 改善）

Organizer タブの「適用済み Diff 履歴」を、ページリロード（F5）なしで最新化できるようにする UX 改善の記録である。

**前提**: 79_phase7_a_history_ui_mvp.md（Step3/4 の履歴 UI）。GET /api/confirmations/history は実装済み。

---

## 1. 何を変えたか

### 1.1 変更ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/components/ProposalPanel.tsx` | 履歴取得ロジックを `fetchHistory(silent?: boolean)` に切り出し。初回表示時（useEffect）と、relation / grouping / decomposition の各 Apply 成功直後に `fetchHistory(true)` を呼ぶ。既存の Apply フロー（confirm → confirmations 発行 → apply API → 成功メッセージ・onRefreshDashboard）はそのまま。成功判定の後に 1 行追加で呼ぶだけ。 |

### 1.2 挙動

- **fetchHistory()**: GET /api/confirmations/history?limit=50 を呼び、結果で `historyItems` / `historyError` を更新する。
- **fetchHistory(silent)**:
  - `silent === true` のとき: loading 表示を出さない。Apply 成功後の「静かな再取得」用。
  - `silent` 未指定または false のとき: 従来どおり `historyLoading` を true/false して読み込み表示する（Organizer タブ初回表示時）。
- **Apply 成功後**: relation / grouping / decomposition のいずれかで Apply が成功した直後に `fetchHistory(true)` を 1 回呼ぶ。これにより履歴一覧が再取得され、直前に適用した 1 件が一覧の先頭に追加されて見える。
- **エラー時**: 既存方針どおり。Apply が失敗した場合は catch 内で既存の setXxxApplyError のみ。履歴の再取得は成功時のみ行う。

### 1.3 壊していないこと

- Organizer 提案（organizerResult / diffs）の表示はリロードしていないため、そのまま残る。
- relation / grouping / decomposition の Apply の confirm → API 呼び出し → 成功メッセージ・onRefreshDashboard の流れは変更していない。成功後に `fetchHistory(true)` を追加しただけ。
- 履歴の初回取得（Organizer タブ表示時）は従来どおり useEffect で fetchHistory() を呼ぶ。

---

## 2. 手動確認手順

| # | 手順 | 期待結果 |
|---|------|----------|
| 1 | Dashboard を開き、Organizer タブを選択する。 | 「適用済み Diff 履歴」が表示され、既存の履歴があれば一覧に出る。 |
| 2 | Organizer 提案を生成し、relation / grouping / decomposition のいずれか 1 件で「このDiffを反映する」→ Confirm → OK する。 | Apply が成功し、成功メッセージ（例: 「反映しました（…）」）が表示される。 |
| 3 | ページをリロード（F5）せずに、「適用済み Diff 履歴」の一覧を見る。 | 直前に適用した 1 件が一覧の先頭（または上位）に追加されて表示されている。F5 しなくても履歴が 1 件増えている。 |
| 4 | Organizer 提案のテキスト（適用可能な Diff ブロックなど）を確認する。 | リロードしていないため、提案結果や Diff 表示が消えていない。 |
| 5 | （任意）別の種別（例: grouping）でも同様に Apply 成功 → 履歴を確認する。 | 同様にリロードなしで履歴が増えている。 |

---

## 3. MVP の割り切り

| 項目 | 内容 |
|------|------|
| **再取得のタイミング** | Apply 成功時のみ。手動の「更新」ボタンや一定間隔のポーリングは行わない。 |
| **失敗時の履歴更新** | Apply が失敗した場合は履歴を再取得しない。既存のエラー表示のみ。 |
| **履歴再取得のエラー** | fetchHistory(true) が失敗（ネットワークエラー等）した場合、履歴一覧はそのまま。エラー toast 等は出さない（既存の「履歴の取得に失敗しました」は初回表示用）。必要なら後で「更新に失敗しました」を追加可能。 |
| **競合** | 同一タブで複数 Apply を連続で成功させた場合、最後の成功ごとに 1 回再取得する。競合制御は行わない。 |

---

以上。Phase7-A の履歴をリロード不要で更新する UX 改善の内容と確認手順を記録した。
