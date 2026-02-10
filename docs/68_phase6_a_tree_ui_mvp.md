# 68 — Phase6-A ツリー可視化（UI）MVP

decomposition で作った「親→子」の構造（nodes.parent_id + node_children）を /dashboard で見える形にする。**表示のみ**。編集・ドラッグ・Undo・並び替えは行わない。Phase5-A/B/C は壊さない。

---

## 1. 変更したファイル一覧

| ファイル | 変更内容 |
|----------|----------|
| `src/app/api/dashboard/route.ts` | `node_children` を取得し、レスポンスに `node_children: [{ parent_id, child_id, created_at }]` を追加。テーブル未存在時はエラーを無視して空配列。 |
| `src/lib/dashboardTree.ts` | **新規**。`buildTree(nodes, node_children)`。真実は node_children 優先・parent_id は fallback。循環検知・深さ MAX_DEPTH=5。`TreeNode` 型を export。 |
| `src/components/TreeList.tsx` | **新規**。開閉（▶/▼）・子件数・インデント・薄いガイド線。`onSelectNode` で詳細パネル連携。循環時は「循環のため表示を打ち切り」を表示。 |
| `src/app/dashboard/page.tsx` | Node 型に `parent_id`, `sibling_order`, `created_at` を追加。`nodeChildren` / `viewMode`（flat \| tree）/ `expandedSet` を state に追加。`refreshDashboard` で `node_children` を保存。`treeRoots = buildTree(visibleNodes, nodeChildren)`。一覧ヘッダーに「フラット / ツリー」切替を追加。ツリー時は `TreeList`、フラット時は従来の `visibleNodes.map`。 |

---

## 2. 主要な関数：buildTree

**場所**: `src/lib/dashboardTree.ts`

**シグネチャ**:
```ts
function buildTree(
  nodes: Array<Record<string, unknown> & { id: string; parent_id?: string | null }>,
  nodeChildren: NodeChildLink[]  // { parent_id, child_id, created_at? }[]
): TreeNode[]
```

**挙動**:
- **親→子マップ**: `node_children` を優先して構築。存在しない場合は `nodes[].parent_id` から補完。
- **ルート**: 一覧内で「誰の子でもない」ノードをルートとする（`findRootIds`）。
- **再帰**: 各ルートから `buildTreeRec` で子を辿る。`visited` で循環検知し、同じ ID が再登場したら `cycleDetected: true` で打ち切り。
- **深さ**: `depth >= MAX_DEPTH`（5）で子を辿らない。
- **戻り値**: `TreeNode[]`（各要素は `id`, `node`, `children`, `depth`, `cycleDetected?`）。

---

## 3. /dashboard の UI 差分

- **一覧ヘッダー**: 「一覧：{トレー名}」の右に **フラット** / **ツリー** の 2 ボタンを追加。デフォルトは **ツリー**。
- **ツリー表示時**:
  - 各行に **▶ / ▼** で開閉。子がいない場合は **·**。
  - **子N件** を表示。
  - 階層に応じて左インデント＋薄い縦線（ガイド）。
  - 行クリックで従来どおり詳細パネルにそのノードを表示。
- **フラット表示時**: 従来どおりの平たいリスト（変更なし）。
- **データ取得失敗時**: 既存の `error` 表示のまま（「API error」等）。ツリー用 state は初期値のため崩れない。

---

## 4. 手動確認手順（チェックリスト）

- [ ] **API**: `GET /api/dashboard` のレスポンスに `node_children` が含まれる（配列。要素は `parent_id`, `child_id`, `created_at`）。
- [ ] **表示切替**: 一覧で「ツリー」を選ぶとツリー表示、「フラット」を選ぶと従来の一覧になる。
- [ ] **開閉**: 子がいる親で ▶ をクリックすると ▼ に変わり子が表示される。再度クリックで閉じる。
- [ ] **子件数**: 親ノードに「子2件」などと表示される。
- [ ] **詳細連携**: ツリーの任意の行をクリックすると右側の詳細パネルにそのノードが表示される。
- [ ] **decomposition 適用済み**: 親（例: 0e11d5e1...）を開くと、その配下に「講演内容の詳細」「講演者のプロフィール」など子 2 件が表示される。
- [ ] **再読み込み**: ページをリロード（または refresh）してもツリーが再構築され、同様に親を開くと子が表示される。
- [ ] **エラー時**: ネットワークエラー等で API が失敗した場合、既存のエラーメッセージが表示され、画面が崩れない。
- [ ] **Phase5 不破壊**: Organizer タブの relation / grouping / decomposition の Diff 表示・Apply が従来どおり動作する。

---

## 5. データ整合性（表示の「真実」）

- **優先**: `node_children`（明示的な親子リンク）。
- **fallback**: `nodes[].parent_id`（node_children に無い場合のみ使用）。
- **循環**: 同一 ID が再登場したらその枝は打ち切り、「循環のため表示を打ち切り」を表示。
- **深さ**: 最大 5 階層まで表示（無限ループ防止）。

---

以上。Phase6-A ツリー可視化 MVP は表示のみで完了とする。
