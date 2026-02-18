# 97 — Phase9-A 履歴クリック時のツリー連動 MVP 設計

Phase9-A「履歴 1 件クリック時に該当 node_id をツリーで自動展開・ハイライト・詳細表示する」を、DB 変更なし・API 変更なし・既存を壊さない前提で実現する MVP の設計を定義する。

**参照**: 77_phase7_history_design.md、92_phase8_b_reason_mvp_design.md、96_phase8_b_reason_closeout.md、[src/app/dashboard/page.tsx](src/app/dashboard/page.tsx)、[src/components/ProposalPanel.tsx](src/components/ProposalPanel.tsx)、[src/components/TreeList.tsx](src/components/TreeList.tsx)。

---

## 1. 目的・スコープ

**目的**: 履歴 1 件をクリックしたときに、その履歴に関連するノードをツリー上で自動展開し、該当ノードをハイライトし、代表ノードの詳細を右パネルに表示する。

**スコープ**:

| 項目 | 内容 |
|------|------|
| **対象 type** | relation / grouping / decomposition の 3 種。status_change は本 MVP では対象外（77 と同様）。 |
| **変更範囲** | フロントのみ（Dashboard page、ProposalPanel、TreeList）。DB・API は変更しない。 |
| **既存維持** | ツリー開閉永続化（Phase6-B）、履歴一覧・詳細・復元（Phase7/8）、Organizer/Apply はすべて維持する。 |

---

## 2. 制約

- **DB 変更なし**: confirmation_events 等のスキーマ・API は変更しない。
- **API 変更なし**: GET /api/confirmations/history 等の仕様は変更しない。
- **既存を壊さない**: ツリーの手動開閉・キーボード操作・詳細パネル選択・履歴タブの既存動作はそのまま。履歴クリックは「追加の連携」として実装する。

---

## 3. 履歴 1 件から取り出す node_id のルール

履歴 API の 1 件は `confirmation_events.node_id` と `proposed_change`（type 別のフィールド）から構成される。type ごとに「詳細表示に使う代表 node_id（primaryNodeId）」と「ツリー展開・ハイライトに使う node_id 一覧（nodeIds）」を定義する。

| type | primaryNodeId | nodeIds（展開・ハイライト用） |
|------|----------------|------------------------------|
| **relation** | proposed_change.from_node_id | from_node_id, to_node_id |
| **grouping** | node_ids[0]（代表） | node_ids の全件 |
| **decomposition** | proposed_change.parent_node_id | parent_node_id（add_children で作られた子は履歴に ID が無いため、親のみ） |

取得元はすべて `proposed_change` および既存の履歴 item から導出可能（77・ProposalPanel の既存パースと整合）。

---

## 4. 挙動（ユーザーから見た仕様）

- ユーザーが Organizer タブの「履歴」で 1 件をクリックする。
- 次の 3 つが同時に行われる。

  1. **ツリー自動展開**: nodeIds に含まれる各ノードがツリー上で見えるように、そのノードまでの経路（祖先）をすべて展開する。既存の expandedSet に追加する形とし、localStorage 永続化（Phase6-B）とも整合する。
  2. **ハイライト**: nodeIds に含まれるノードをツリー上で視覚的にハイライトする（例: 背景色を変える）。1 ノードだけの場合はその 1 件、複数の場合は複数ノードをハイライトする。
  3. **詳細表示**: primaryNodeId に対応するノードを右側の「詳細パネル」に表示する（既存の setSelected に該当ノードを渡す）。該当ノードが現在のトレー（visibleNodes）に存在しない場合は、詳細表示の更新は行わない（primary が存在するノードのみ展開・ハイライトは行う）。

- **ハイライトのクリア**: ユーザーがツリーで別ノードをクリックしたときにハイライトをクリアする（MVP ではシンプルにこのルールとする）。

- **フラット表示時**: ツリーがないため「展開」は意味を持たない。フラット表示のときは、履歴クリックで「詳細表示」（selected の更新）と、一覧行のハイライト（必要なら）のみ行う。

---

## 5. 変更箇所（実装は別タスク、設計では「何を変えるか」のみ）

| 箇所 | 変更内容 |
|------|----------|
| **ProposalPanel** | 履歴 1 件クリック時に、type に応じて primaryNodeId と nodeIds を導出し、親に通知する。新 props: `onHistoryItemSelect?: (payload: { primaryNodeId: string; nodeIds: string[] }) => void`。クリック時に `setSelectedHistoryConfirmationId` に加えて `onHistoryItemSelect?.(...)` を呼ぶ。 |
| **Dashboard page** | `onHistoryItemSelect` を ProposalPanel に渡す。コールバック内で: (1) treeRoots から「ノード→親」のマップを導出し、nodeIds 各要素についてルートまでの祖先を求め、expandedSet に追加；(2) ハイライト用 state（例: highlightNodeIds）を set し、TreeList に渡す；(3) primaryNodeId が visibleNodes に存在すれば setSelected(そのノード) で詳細表示。ツリー表示時は (1)(2)(3)、フラット時は (3) および一覧ハイライトのみなどと役割を分ける。ツリーで別ノードを選択したときにハイライトをクリアする。 |
| **TreeList** | オプションで「ハイライト対象 ID の集合」を受け取る（例: `highlightIds` を Set&lt;string&gt; または null）。各行で `highlightIds?.has(id)` のとき背景色をハイライト用に変更。既存の selectedId とは別（selected = 詳細表示、highlight = 履歴由来の複数可）。 |

---

## 6. 本 MVP で行わないこと（割り切り）

| 項目 | 内容 |
|------|------|
| **複数件同時選択** | 履歴から「複数件」を同時に選択してツリー連動することは行わない（常に 1 件クリック）。 |
| **status_change** | status_change の履歴は対象外（ツリー連動しない）。 |
| **存在しない node_id** | ツリーに存在しない node_id（別トレーや削除済み）への「代替表示」や API 追加は行わない。その場合は詳細表示のみスキップするなど、フロントで扱える範囲のみとする。 |
| **アニメーション・スクロール** | ハイライトの「アニメーション」や「スクロールして見せる」は MVP では必須としない。 |

---

## 7. 参照ドキュメント

| 番号 | ファイル名 |
|------|------------|
| 77 | 77_phase7_history_design.md（履歴データ構造） |
| 92 | 92_phase8_b_reason_mvp_design.md（設計雛形） |
| 96 | 96_phase8_b_reason_closeout.md（直近 Phase クローズ） |
| 68 / 72 | Phase6 ツリー UI / 開閉永続化 |

---

以上。Phase9-A 履歴クリック時のツリー連動 MVP の設計を定義した。
