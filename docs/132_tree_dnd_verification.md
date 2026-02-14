# 132 — Tree D&D 実装後検証・仕上げ

実装（dnd-kit / POST /api/tree/move / TreeList 連携）の検証と穴埋め結果。**検証→穴埋め→回帰防止**の順で実施した内容を記録する。

---

## 1. UI 再現テスト（手動確認用チェックリスト）

以下は手動で画面操作して確認する項目。実施日・実結果欄は運用で記入する。

### A. 同一親内の並び替え

| 手順 | 期待結果 | 実結果 |
|------|----------|--------|
| 兄弟 3 件以上の親を用意し、前スロットへドロップ | 順序が変わる | （記入） |
| リロード | 順序が維持される | （記入） |
| Network タブで POST /api/tree/move の body を確認 | orderedSiblingIds が「その親の子ども全体」を正しい順で送っている | （記入） |

### B. 親変更（別ノードの子にする）

| 手順 | 期待結果 | 実結果 |
|------|----------|--------|
| movedNode を別ノード配下の「前」スロットへドロップ | movedNode の parent_id が更新され、新しい親配下に表示される | （記入） |
| 旧親を確認 | 旧親配下から movedNode が消え、兄弟順も壊れていない | （記入） |

### C. ルート化

| 手順 | 期待結果 | 実結果 |
|------|----------|--------|
| 子ノードをルート層のドロップスロット（drop-root-*）にドロップ | parent_id=null になりルートに表示される | （記入） |
| リロード | ルート表示が維持される | （記入） |

---

## 2. 禁止ルール・境界条件（実施した穴埋め）

### A. 循環参照の禁止

- **UI**: ドラッグ中、movedNode の子孫配下のドロップスロットは `disabled`（`canDrop(activeId, parentId)` で無効）。子孫へドロップできない。
- **サーバ**: `validateTreeMove` で `isDescendant(movedNodeId, newParentId)` を必ず実行。true なら 400 を返す。UI をすり抜けても reject。
- **自分自身**: `movedNodeId === newParentId` は 400（サーバ・validate で検証）。
- **折りたたみ**: 循環判定は「全ノードの親子」で実施。表示上の折りたたみは関係しない。

### B. null / 存在しない ID

- **newParentId null**: ルート化として正常処理（validate で許可）。
- **movedNodeId が存在しない**: 404 + サーバログ `[tree/move] reject ... movedNodeId not found`。
- **newParentId が存在しない**: 404 + 同様にログ。

### C. フィルタ / 折りたたみ時の挙動（仕様で対応）

- **問題**: トレーを「実施中」などに絞ると、表示されるのはそのトレーのノードのみ。`orderedSiblingIds` を「表示されている兄弟だけ」で送ると、非表示の兄弟が DB 上にいる場合に順序が壊れる。
- **対応**: **「全て（進行中の仕事）」のときだけ D&D を有効にした**（`onTreeMove` は `activeTrayKey === "all"` のときのみ渡す）。フィルタ中はドラッグ・ドロップ自体が無効になり、部分リスト送信を防ぐ。
- **仕様**: フィルタ表示中は並び替え不可。安全優先。

---

## 3. データ整合性

- **正**: `nodes.parent_id` と `nodes.sibling_order`。移動 API は nodes を更新したあと、影響した親について `node_children` を DELETE してから nodes の子一覧で INSERT し直している。
- **sibling_order**: 同一親内で 0,1,2,... の連番にサーバ側で振り直し。重複・欠番は起きない設計。
- **orderedSiblingIds の検証**: 同一親内 reorder のとき、クライアント送信の `orderedSiblingIds` が「現在の兄弟 ID 集合」と一致しない場合は 400（`orderedSiblingIds must match current siblings exactly (reorder)`）。部分リスト送信を拒否。
- **node_children**: QuickAdd のみで作った親子は従来どおり `node_children` に行が無い場合があるが、D&D で移動したノードは「影響した親」の node_children を上書きするため、移動を介した親子は node_children に同期される。

---

## 4. UX 仕上げ（実施済み・最小）

- **ドラッグ中**: ドラッグ中の行は `opacity: 0.5` で「何を掴んでいるか」が分かる。
- **ドロップ可能箇所**: `isOver && allowed` のときのみスロットにハイライト（`var(--border-focus)`）。禁止箇所は `disabled` でドロップ不可。
- **ネスト中の禁止表示**: 子孫配下のスロットには `activeDragId` を渡し、再帰中も同じドラッグで canDrop を評価している。
- **Undo / トースト**: 未実装。失敗時は `setError` で画面上部にエラー表示。成功時は `refreshDashboard` で即時反映のみ。

---

## 5. 回帰防止（実施済み）

### 5.1 API 検証の単体テスト

- **`src/app/api/tree/move/validate.test.ts`**: `validateTreeMove(body, nodes)` の 9 ケース。
  - 正常: 同一親 reorder、ルート化（newParentId null）。
  - reject: 循環（子孫へ移動）、自分自身へ、movedNodeId 不在（404）、newParentId 不在（404）、reorder 時 orderedSiblingIds が兄弟全体と不一致（400）、movedNodeId が UUID でない（400）。
- **`src/lib/dashboardTree.test.ts`**: `isDescendant` の 5 ケース（同一 ID false、直接の子 true、孫 true、無関係 false、逆方向 false）。

### 5.2 サーバログ

- すべての reject で `console.warn("[tree/move] reject", { movedNodeId: 先頭8文字, newParentId: 先頭8文字 or null, reason })` を出力。機密は出さず、追跡用。

---

## 6. 変更ファイル一覧（本検証で追加・修正したもの）

| ファイル | 内容 |
|----------|------|
| `src/app/api/tree/move/route.ts` | validateTreeMove を利用。リジェクト時に logReject でログ出力。 |
| `src/app/api/tree/move/validate.ts` | 新規。検証ロジックを分離（単体テスト用）。 |
| `src/app/api/tree/move/validate.test.ts` | 新規。validateTreeMove の 9 テスト。 |
| `src/lib/dashboardTree.test.ts` | 新規。isDescendant の 5 テスト。 |
| `src/app/dashboard/page.tsx` | `onTreeMove` を `activeTrayKey === "all"` のときのみ渡す。 |
| `src/components/TreeList.tsx` | DraggableTreeRow に `activeDragId` を渡し、再帰中のドロップ可否を正しく判定。 |

---

## 7. 残課題・推奨

- **手動 UI テスト**: 上記 §1 の表を実機で実施し、実結果を記入すること。
- **Undo / 成功トースト**: 必要なら別 Phase で「直前に移動した操作を戻す」または「移動しました」トーストを検討。
- **ドロップスロットの数**: 現在は「各ノードの前」に 1 スロット。多すぎる場合は「ノードの上半分で挿入前・下半分で子の先頭」などにまとめる設計もあり得る。

---

## 参照

- Tree D&D 実装プラン（cursor plans）
- `src/app/api/tree/move/route.ts` — API 本体
- `src/app/api/tree/move/validate.ts` — 検証ロジック

以上。Tree D&D 実装後検証・仕上げの記録とする。
