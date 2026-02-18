# 85 — Phase7-B 履歴フィルタ UI 実装計画

Phase7-B 第一テーマ「履歴の type / node_id フィルタ UI」の実装計画を定義する。

**前提**: 84_phase7_b_scope.md（スコープ確定）。GET /api/confirmations/history は type / node_id クエリに対応済み。本計画はフロントのみの変更とする。

---

## 1. 目的

- **履歴が増えたときに、type / node_id で絞り込めるようにする。** 「relation だけ見たい」「この Node に関係する履歴だけ見たい」というニーズに答える。
- **API は既に対応済み**のため、**フロントのみ変更**する。API の仕様変更・DB 変更は行わない。

---

## 2. UI 構成（文章で図解）

```
[Organizer タブ]

  … 既存: Organizer提案を生成 / 適用可能な Diff（relation / grouping / decomposition）…

  ┌─────────────────────────────────────────────────────────────┐
  │ 適用済み Diff 履歴                                            │
  ├─────────────────────────────────────────────────────────────┤
  │ 【新規】フィルタ                                              │
  │  種別: [すべて ▼]  (または [relation] [grouping] [decomposition])  │
  │  node_id: [                    ] (任意・UUID 形式)            │
  │  ※ 種別変更 or node_id 入力変更時に fetchHistory を再実行      │
  ├─────────────────────────────────────────────────────────────┤
  │ 読み込み中… / エラー / 0件メッセージ / 一覧（既存）            │
  │  [行1] 日時 | 種別 | 要約  … クリックで詳細                    │
  │  [行2] …                                                      │
  └─────────────────────────────────────────────────────────────┘
```

- **履歴ブロックの上部**に、次の 2 つを追加する。
  - **種別セレクト**: 値は「すべて」/ 「relation」/ 「grouping」/ 「decomposition」。選択時に履歴を再取得する。
  - **node_id 入力欄**: 任意。UUID 形式である場合のみ API に node_id クエリを付与する。不正な形式の場合は API を呼ばない、または「すべて」と同様に node_id なしで呼ぶ。入力変更時（例: 入力確定後やボタン押下後）に履歴を再取得する。
- **フィルタ変更時**に、`fetchHistory(silent)` を再実行する。初回表示やフィルタ変更時は `fetchHistory()`（loading 表示あり）、Apply 成功後は既存どおり `fetchHistory(true)` で、その時点の filterType / nodeIdFilter をクエリに含める。

---

## 3. 実装ステップ（Step0〜Step5）

### Step0: 現在の fetchHistory の仕様整理

- **目的**: 既存の fetchHistory がどのように API を呼んでいるかを確認し、クエリパラメータを付与する拡張箇所を把握する。
- **変更対象**: なし（事前調査）。
- **確認内容**: ProposalPanel 内の fetchHistory は現在 `GET /api/confirmations/history?limit=50` を呼んでいる。API は `type` と `node_id` をクエリで受け取り、省略時は絞り込みなし。fetchHistory の引数に type と node_id を渡すか、または state（filterType / nodeIdFilter）を参照して URL を組み立てる形に変更する。

---

### Step1: ProposalPanel に filterType state 追加

- **目的**: 種別フィルタの値を保持する。
- **変更対象**: `src/components/ProposalPanel.tsx`
- **内容**: `filterType` を state で追加する。値は `""`（すべて）または `"relation"` / `"grouping"` / `"decomposition"`。初期値は `""`。fetchHistory を呼ぶときに、filterType が空でなければ `?type=${filterType}` を付与する（既存の limit=50 に追加）。

---

### Step2: nodeIdFilter state 追加

- **目的**: node_id で絞り込むための入力値を保持する。
- **変更対象**: `src/components/ProposalPanel.tsx`
- **内容**: `nodeIdFilter` を state で追加する。初期値は `""`。入力欄は任意のため、空のときは API に node_id を付けない。値が入っているときは UUID 形式かどうかをチェックし、妥当な場合のみ `&node_id=${nodeIdFilter}` を付与する。不正な UUID の場合は API を呼ばない、またはエラーメッセージを表示する（方針は実装時に決定）。

---

### Step3: UI 部品追加

- **目的**: 履歴ブロック上部に種別セレクトと node_id 入力欄を表示する。
- **変更対象**: `src/components/ProposalPanel.tsx`
- **内容**:
  - 「適用済み Diff 履歴」見出しの直下に、種別用の `<select>` を配置。option は「すべて」「関係追加（relation）」「グループ化（grouping）」「分解（decomposition）」など。value は `""` / `"relation"` / `"grouping"` / `"decomposition"`。onChange で setFilterType し、fetchHistory() を呼ぶ。
  - その横または下に、node_id 用の `<input type="text">` を配置。placeholder に「node_id（任意）」等。onChange で setNodeIdFilter。再取得のトリガーは「入力確定後」とする（onBlur で fetchHistory() を呼ぶ、または「絞り込む」ボタンで呼ぶ。MVP では onBlur またはボタンのいずれかでよい）。
  - 既存の「読み込み中…」「エラー」「0件」「一覧」はそのまま下に表示する。

---

### Step4: fetchHistory 呼び出し時にクエリ付与

- **目的**: 初回表示・フィルタ変更・Apply 成功後のいずれでも、現在の filterType / nodeIdFilter を API に渡す。
- **変更対象**: `src/components/ProposalPanel.tsx`
- **内容**:
  - fetchHistory 内で、URL を組み立てる。ベースは `/api/confirmations/history?limit=50`。filterType が空でなければ `&type=${filterType}` を追加。nodeIdFilter が空でなくかつ UUID 形式なら `&node_id=${encodeURIComponent(nodeIdFilter.trim())}` を追加。
  - useEffect（Organizer タブ表示時）では、fetchHistory() を呼ぶ（既存どおり）。このときも filterType / nodeIdFilter を参照するため、fetchHistory はそれらを引数で受け取るか、state を参照する。state を参照する形なら、依存配列に filterType / nodeIdFilter を入れない（初回のみ実行）。初回表示時は filterType / nodeIdFilter は初期値のため、従来どおり「すべて」・node_id なしで取得する。
  - フィルタ変更時（Step3 の onChange / onBlur 等）では、setFilterType または setNodeIdFilter の後に fetchHistory() を呼ぶ。
  - Apply 成功後は、既存どおり fetchHistory(true) を呼ぶ。このときも現在の filterType / nodeIdFilter を使ってクエリを付与し、表示中のフィルタ条件で最新の履歴を再取得する。

---

### Step5: 手動 E2E テスト

- **目的**: DoD に基づき、フィルタの動作と既存機能が壊れていないことを確認する。
- **変更対象**: なし（手動確認）。
- **内容**: §5 の Definition of Done に従い、チェックリストを 1 つずつ実施する。結果は別 doc（86 以降）に記録してもよい。

---

## 4. Definition of Done

| # | 確認項目 | 期待結果 |
|---|----------|----------|
| 1 | 種別を変更すると、履歴一覧がその種別で絞り込まれて表示される | 「relation」選択時は relation のみ、「すべて」では全種別が表示される。 |
| 2 | node_id に有効な UUID を入力し、確定（onBlur またはボタン）すると、その Node に関係する履歴のみ表示される | 一覧が node_id で絞り込まれる。 |
| 3 | フィルタ結果が 0 件のとき、空表示（「Apply 済みの Diff はまだありません」または「該当する履歴がありません」等）が正しく出る | エラーにならず、メッセージが表示される。 |
| 4 | Apply 成功後、リロードなしで履歴が 1 件増えて表示される（81 の挙動）が壊れていない | フィルタ条件を変えていなくても、Apply 成功後に履歴が更新される。 |
| 5 | Phase6 のツリー表示（フラット／ツリー切替、開閉、詳細パネル連携）が壊れていない | /dashboard でツリー・開閉・詳細が問題なく動作する。 |

---

## 5. 影響範囲

| 項目 | 内容 |
|------|------|
| **変更ファイル** | `src/components/ProposalPanel.tsx` のみ。 |
| **API** | 変更不要。GET /api/confirmations/history の既存の type / node_id クエリを利用する。 |
| **DB** | 変更なし。 |
| **その他コンポーネント** | ProposalPanel 以外は触らない。Dashboard や TreeList、Apply API は変更しない。 |

---

## 6. 参照ドキュメント

| 番号 | ファイル名 |
|------|------------|
| 84 | 84_phase7_b_scope.md |
| 77 | 77_phase7_history_design.md（API 仕様） |
| 81 | 81_phase7_a_history_no_reload_update.md（Apply 後の再取得） |

---

以上。Phase7-B 履歴フィルタ UI の実装計画を定義した。
