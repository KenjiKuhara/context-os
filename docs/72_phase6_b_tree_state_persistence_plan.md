# 72 — Phase6-B ツリー開閉状態の永続化 計画

Phase6-B の最初のテーマ「ツリーの開閉状態の永続化（expanded state persistence）」の目的・MVP 範囲・実装方針・DoD を定める。**実装は本 doc 確定後に行う。**

**前提**: 70（Phase6-B スコープ）、68（Phase6-A ツリー UI）。Phase6-A の expandedSet（開閉状態）はフロントの state のみで、refresh でリセットされる現状を改める。

---

## 1. 目的（ユーザー体験）

- **refresh やダッシュボード再訪問後も、「さっき開いていたノード」が開いたままになる** ようにする。
- ユーザーが手動で開閉した結果が失われず、ツリーを「自分の見たい形」で維持できるようにする。これによりツリーの利用頻度と満足度を上げる。

---

## 2. MVP の範囲

- **保存するもの**: 開いているノードの ID の集合（expandedSet に含まれる node id のリスト）。
- **保存先**: MVP では **ローカル保存（localStorage）** とする。同一ブラウザ・同一オリジン内で永続化できれば足りる。サーバ保存（API・DB）は Phase6-B の範囲外とする。
- **復元のタイミング**: /dashboard を開いたとき、または dashboard データ（trays / node_children）を取得した直後に、保存済みの expanded の ID リストを読み取り、**現在の treeRoots に存在する ID だけ** を expandedSet に反映する。存在しない ID（削除されたノード等）は無視する。
- **保存のタイミング**: 開閉が変わるたびに保存する（展開・閉じるの都度）。デバウンス（例: 300ms）をかけてもよいが、MVP では「都度保存」でもよい。

---

## 3. やらないこと

| 項目 | 内容 |
|------|------|
| **サーバ保存** | 開閉状態を API で送信したり DB に保存したりしない。ローカルのみ。 |
| **Undo** | 開閉操作の取り消しや「ひとつ前の開閉状態に戻す」は行わない。 |
| **並び替え・編集** | ノードの並び替え・親変更・タイトル編集は本テーマの範囲外。 |
| **デバイス間同期** | 別ブラウザ・別端末との開閉状態の同期は行わない。 |
| **トレー別の開閉** | 「全て」と「実施中」などトレー切替ごとに別の開閉状態を保存するかは MVP では **同一キーで 1 セット** とする（トレーが変わっても同じ expanded を復元してよい）。 |

---

## 4. 実装方針

### 4.1 State

- 開閉状態は **既存の expandedSet（React state）** をそのまま使う。永続化は「読み込み時に localStorage から merge」「変更時に localStorage へ書き込み」の 2 点を追加するだけとする。
- dashboard/page の `expandedSet` と `setExpandedSet` を維持し、TreeList の開閉・キーボードの挙動は変えない。

### 4.2 保存キーと形式

- **localStorage のキー**: 1 つでよい。例: `context-os-tree-expanded` または `dashboard-tree-expanded`。
- **値**: 文字列の配列（expanded な node id のリスト）を **JSON.stringify** した文字列。例: `["uuid-1","uuid-2"]`。読み込み時は JSON.parse し、配列でない・要素が文字列でない場合は無視して空の Set とする。

### 4.3 API

- **新規 API は作らない**。すべてフロントの localStorage の読み書きで完結する。

### 4.4 保存タイミング

- **setExpandedSet が呼ばれたとき**（開閉の変更がコミットされたとき）に、新しい expandedSet を localStorage に書き込む。dashboard 側で setExpandedSet をラップするか、useEffect で expandedSet の変更を監視して保存する。
- 初回表示時（mount 時または trays/node_children 取得後）に、localStorage から読み取り、**現在の visibleNodes / treeRoots に存在する id だけ** を expandedSet にセットする。存在しない id は捨てる（データが変わっているため）。

### 4.5 注意点

- **キー競合**: 他機能で同じ localStorage キーを使わないようにする。プレフィックス（例: `context-os-`）を付けておく。
- **容量**: 開いているノード数が極端に多くなければ、数百 ID 程度の JSON で収まる。localStorage の 5MB 制限を気にする必要はない。

---

## 5. Definition of Done（手動確認）

以下を手動で 1 回実施し、満たした時点で本テーマの MVP を完了とする。

| # | 条件 | 確認 |
|---|------|------|
| 1 | ツリーでいくつかノードを開き、ページをリロード（F5）する。再表示後、**開いていたノードが開いたまま** になっている。 | [ ] |
| 2 | ツリーでノードを閉じる。リロード後、**閉じた状態が維持** されている。 | [ ] |
| 3 | 別タブまたは再度 /dashboard に遷移して戻る。**開閉状態が復元** されている。 | [ ] |
| 4 | 開閉状態を変更したあと、localStorage にキー（例: context-os-tree-expanded）で配列が保存されていることを DevTools 等で確認できる。 | [ ] |
| 5 | 存在しないノード ID が localStorage に含まれていても、読み込み時にエラーにならず、**存在する ID だけ** が展開される（または無視される）。 | [ ] |
| 6 | Phase6-A の挙動が壊れていない。フラット／ツリー切替、キーボード（→←↑↓）、詳細パネル連携が従来どおり動作する。 | [ ] |

---

## 6. 変更が見込まれるファイル（実装時参照）

- `src/app/dashboard/page.tsx`: expandedSet の初期化で localStorage から復元、setExpandedSet の呼び出し後に localStorage へ保存する処理を追加。必要なら custom hook（例: usePersistedExpandedSet）に切り出してもよい。
- 新規: `src/hooks/usePersistedExpandedSet.ts` 等（オプション）。key と「現在有効な id の集合」を渡し、load/save を閉じ込める。

※ 上記は方針であり、実装時に 68 や既存コードに合わせて調整する。

---

以上。Phase6-B の「ツリー開閉状態の永続化」の設計とする。実装は本 doc に沿って行う。
