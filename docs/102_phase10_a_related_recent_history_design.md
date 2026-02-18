# 102 — Phase10-A ノード詳細に関連する直近履歴 1 件表示 設計

101 で選定した「ノード詳細に関連する直近履歴 1 件表示（Phase10-A）」の実装設計を定義する。

**前提**: 101_phase10_theme_definition.md。**目的**: ノード詳細パネルに、そのノードに関係する confirmation のうち直近 1 件だけを表示する。

**条件**: DB 変更なし／既存 API（GET /api/confirmations/history）を利用する／既存履歴タブは変更しない／既存 Apply・復元・ツリー挙動を壊さない／MVP として最小構成。

**参照**: [src/app/api/confirmations/history/route.ts](src/app/api/confirmations/history/route.ts)、[src/app/dashboard/page.tsx](src/app/dashboard/page.tsx)。

---

## 1. データ取得方法（node_id 指定の既存 API 利用）

- **API**: GET /api/confirmations/history
- **クエリ**: `node_id={選択中ノードの id}`、`limit=1`
- **利用するのみ**: API の仕様変更は行わない。既存の node_id フィルタと limit の挙動に依存する。
- **取得タイミング**: 詳細パネルに表示するノード（`selected`）が変わったとき。`selected` が null のときは呼ばない。`selected.id` を node_id に渡す。
- **実装**: Dashboard ページ内で、`selected` が存在しかつ変更されたときに `fetch(/api/confirmations/history?node_id=${selected.id}&limit=1)` を実行し、レスポンスの `items[0]` を state（例: `relatedRecentHistory`) に保持する。0 件のときは `items` が空配列なので `relatedRecentHistory` を null にする。

---

## 2. 「直近」の定義（consumed_at DESC 1 件）

- **直近**: その node_id に関係する履歴のうち、**consumed_at が最も新しい 1 件**とする。
- **根拠**: 既存 API は DB 取得時に `.order("consumed_at", { ascending: false, nullsFirst: false }).order("confirmed_at", { ascending: false })` で取得し、続けて type / node_id でメモリフィルタしたあと `slice(offset, offset + limit)` している。よって `node_id=...&limit=1&offset=0` で取得した 1 件が、該当ノードに関係する履歴のうち consumed_at 降順で先頭＝直近 1 件である。

---

## 3. UI 配置（詳細パネル内のどこに置くか）

- **配置**: 右側の「詳細」パネル内。**ノード基本情報**（タイトル・状態・温度・途中内容・更新）の直下、**Result message**（状態変更後のメッセージ）および「何が起きた？」（Intent 入力）ブロックの**上**に、1 ブロックとして追加する。
- **見出し**: 「このノードに関係する直近の履歴」または「関連する直近履歴」など、1 行のラベルを付ける。
- **レイアウト**: 既存の詳細ブロックと同様、`marginTop` と `borderTop: "1px solid #eee"` で区切り、コンパクトなフォントサイズ（例: 12〜13px）で表示する。

---

## 4. 表示内容（type / 日時 / reason / summary）

| 項目 | 内容 |
|------|------|
| **type** | proposed_change.type を表示用ラベルに変換する。relation → 「関係追加」、grouping → 「グループ化」、decomposition → 「分解」。 |
| **日時** | consumed_at を優先し、無い場合は confirmed_at。表示形式は既存履歴タブに合わせる（例: ISO 文字列の先頭 19 文字を `T` → 空白に置換）。 |
| **reason** | proposed_change.reason が存在しかつ空でないときのみ「理由: {value}」を 1 行で表示する。無い場合は表示しない。 |
| **summary** | type に応じた要約 1 行。relation: `from_node_id（先頭8文字）… → to_node_id（先頭8文字）… relation_type`。grouping: `group_label（n件）`。decomposition: `親 parent_node_id（先頭8文字）… に子 n 件`。 |

表示は読み取り専用。クリックで履歴タブに飛ばすなどの拡張は本 MVP では行わない。

---

## 5. エッジケース（履歴なしの場合）

| ケース | 対応 |
|--------|------|
| **0 件** | API が `items: []` を返したときは、「該当する履歴はありません」という短いメッセージのみ表示する。ブロックは表示し、中身をこのメッセージにする。 |
| **selected が null** | 詳細パネルは既存どおり「左の一覧からノードをクリックしてください」のみ。関連履歴の取得は行わず、ブロックも表示しない。 |
| **取得中** | ローディング表示（例: 「取得中…」）を出してもよい。MVP ではシンプルに、表示可能になるまで何も出さない、または「取得中…」の 1 行でも可。 |
| **取得失敗** | API が ok: false を返したときは、当該ブロック内に「取得できませんでした」等の短いメッセージを表示する。既存の詳細パネルや他機能は影響させない。 |

---

## 6. 変更ファイル一覧

| ファイル | 変更内容 |
|----------|----------|
| [src/app/dashboard/page.tsx](src/app/dashboard/page.tsx) | (1) 関連直近履歴用 state（1 件分 or null）を追加。(2) selected 変更時に GET /api/confirmations/history?node_id=...&limit=1 を呼び、結果を state にセット。(3) 詳細パネル内、ノード基本情報の下に「関連する直近履歴」ブロックを 1 つ追加し、type/日時/reason/summary を表示。0 件時は「該当する履歴はありません」を表示。 |

- **変更しない**: ProposalPanel（履歴タブ）、TreeList、confirmations API、その他既存コンポーネント。DB は変更しない。

---

## 7. 実装ステップ（Step1〜Step4）

| Step | 内容 |
|------|------|
| **Step1** | Dashboard に state を追加する（例: `relatedRecentHistory`）。`selected` が変更されたときに、selected.id で GET /api/confirmations/history?node_id={id}&limit=1 を呼び、レスポンスの items[0] を state にセットする。items が空のときは null。useEffect の依存は [selected?.id]。 |
| **Step2** | 詳細パネル内、ノード基本情報（状態・温度・途中内容・更新）の直下に「関連する直近履歴」ブロックを追加する。relatedRecentHistory が 1 件ある場合、type（ラベル化）・日時・reason（あれば）・summary を表示する。 |
| **Step3** | エッジケースを扱う。relatedRecentHistory が null かつ selected がある場合で「取得済みで 0 件」を区別する必要があれば、別 state（例: fetchedEmpty）を用意する。0 件時は「該当する履歴はありません」を表示する。取得失敗時は「取得できませんでした」を表示する。 |
| **Step4** | 表示フォーマット（日時・summary）を既存履歴タブと整合させ、DoD に沿って手動確認する。既存の詳細・履歴タブ・Apply・復元・ツリーに影響がないことを確認する。 |

---

## 8. Definition of Done

- 左の一覧またはツリーでノードを選択すると、右の詳細パネルに「関連する直近履歴」ブロックが表示される。
- 該当ノードに関係する適用済み履歴が 1 件以上あるとき、直近 1 件の種別・日時・要約が表示される。reason がある場合は「理由: …」も表示される。
- 該当する履歴が 0 件のときは「該当する履歴はありません」が表示される。
- 既存の履歴タブ（一覧・詳細・フィルタ・復元・Phase9-A の履歴→ツリー連動）は変更されておらず、従来どおり動作する。
- 既存の Apply・復元・ツリー・詳細パネルの他ブロック（状態・何が起きた？・推定結果など）は壊れていない。

---

## 9. 本 MVP でやらないこと

| 項目 | 内容 |
|------|------|
| **複数件表示・ページネーション** | 直近 1 件のみ表示する。2 件目以降の表示や「さらに読み込む」は行わない。 |
| **履歴の編集・削除** | 表示は読み取り専用。編集・削除機能は追加しない。 |
| **DB 変更・新規 API** | DB スキーマの変更は行わない。新規 API は作らない。GET /api/confirmations/history の既存仕様の利用のみ。 |
| **履歴タブの変更** | Organizer 内の履歴一覧・詳細・フィルタ・復元・履歴クリック時のツリー連動は一切変更しない。 |
| **クリックで履歴タブへ遷移** | 関連履歴ブロックをクリックしたときに履歴タブにフォーカスする等の導線は本 MVP では追加しない。 |
| **Observer 連携** | Observer の表示や連携は Phase10-A の範囲外とする。 |

---

以上。Phase10-A ノード詳細に関連する直近履歴 1 件表示の設計を定義した。
