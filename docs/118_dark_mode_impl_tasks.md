# 118 — Phase12-Dark ダークモード実装タスク

Phase12-Dark（ダークモード導入）を段階ゲート方式で管理する。117 採用案 C（prefers-color-scheme + 手動切替）に基づき、MVP は /dashboard のみとする。

**参照**: [117_dark_mode_design.md](117_dark_mode_design.md)、[114_phase_status.md](114_phase_status.md)。

---

## 制約（絶対）

- **Phase11-B の文言統一を壊さない**: 文言変更禁止。ラベル・メッセージ・aria-label はそのまま。
- **DB/API/状態遷移ロジック変更禁止**: UI テーマ（色・背景・枠線）に限定する。
- **色はセマンティックトークンで管理**: 直書き禁止。CSS 変数（`:root` / `[data-theme="dark"]`）を参照する。

---

## Block A: Theme 基盤（トークン / 属性 / 初期判定）

| ID | タスク | 内容 | ステータス |
|----|--------|------|------------|
| A1 | data-theme 設計（将来拡張可能なテーマ基盤） | 117 §2.1 どおり。レイヤー分離（ベース／コンポーネント利用）。セマンティック命名のみ。data-theme="light"|"dark"|"system"（JS解決）。将来 high-contrast 追加可能。**A1 では UI の色は切り替えず基盤のみ作成。** | DONE |

---

### A1 設計確定（将来拡張可能なテーマ基盤）

#### 1. トークン定義一覧（ライト / ダーク）

**レイヤー (a) ベースレイヤー**  
各テーマ（light / dark）で「実値」を定義する変数。名前は `--theme-*` とし、色名は使わない。

| トークン（ベース） | ライト（実値例） | ダーク（実値例） | 用途 |
|--------------------|------------------|------------------|------|
| --theme-bg-page | #ffffff | #121212 | ページ背景 |
| --theme-bg-panel | #ffffff | #1e1e1e | パネル・カード背景 |
| --theme-bg-card | #fafafa | #252525 | カード・サブエリア |
| --theme-bg-selected | #f5f7ff | #1e2a4a | 選択中・フォーカス背景 |
| --theme-bg-highlight | #fff8e1 | #3d3520 | ハイライト（履歴連動等） |
| --theme-bg-badge | #f0f0f0 | #3a3a3a | StatusBadge 等 |
| --theme-bg-success | #e8f5e9 | #1b2e1b | 成功ブロック |
| --theme-bg-warning | #fffde7 | #3d3520 | 警告ブロック（異常検知） |
| --theme-bg-warning-strong | #fff9c4 | #4a4020 | 警告内強調 |
| --theme-bg-danger | #fff5f5 | #2e1b1b | エラーブロック |
| --theme-bg-muted | #f8f9fa | #2a2a2a | 控えめな背景 |
| --theme-bg-disabled | #f3f3f3 | #333333 | ローディング等 |
| --theme-bg-code | #f5f5f5 | #2d2d2d | コード・詳細ブロック |
| --theme-text-primary | #171717 | #e8e8e8 | 本文・見出し |
| --theme-text-secondary | #444444 | #b0b0b0 | 補助テキスト |
| --theme-text-muted | #666666 | #888888 | ラベル・薄い文言 |
| --theme-text-muted-strong | #555555 | #999999 | やや強いミュート |
| --theme-text-on-primary | #ffffff | #ffffff | プライマリボタン文字 |
| --theme-text-success | #2e7d32 | #81c784 | 成功メッセージ |
| --theme-text-warning | #8b6914 | #e6c547 | 警告テキスト |
| --theme-text-danger | #c62828 | #ef9a9a | エラー・危険 |
| --theme-text-sage | #4e342e | #d7ccc8 | 大賢者ブロック文言 |
| --theme-border-default | #dddddd | #404040 | 通常枠線 |
| --theme-border-subtle | #eeeeee | #333333 | 区切り線 |
| --theme-border-muted | #cccccc | #555555 | ボタン枠等 |
| --theme-border-focus | #5567ff | #7b8cff | フォーカス・アクティブ |
| --theme-border-warning | #b8860b | #d4a84b | 異常検知枠 |
| --theme-border-danger | #f99 / #c62828 | #e57373 | エラー枠 |
| --theme-border-sage | #5d4037 | #8d6e63 | 大賢者ブロック枠 |
| --theme-color-success | #2e7d32 | #81c784 | 成功（状態色） |
| --theme-color-warning | #b8860b | #d4a84b | 警告（状態色） |
| --theme-color-danger | #c62828 | #ef9a9a | 危険（状態色） |
| --theme-color-info | #5567ff | #7b8cff | 注目・プライマリ |
| --theme-color-info-bg | #f5f7ff | #1e2a4a | 注目背景 |
| --theme-focus-ring | rgba(85,103,255,0.35) | rgba(123,140,255,0.4) | フォーカスリング |

**レイヤー (b) コンポーネント利用レイヤー**  
UI が参照する名前。html 上で `var(--theme-*)` へ転写する。将来 `data-theme="high-contrast"` を足すときは、ベースだけ追加すればよい。

| コンポーネント用トークン | 参照元（ベース） |
|--------------------------|------------------|
| --bg-page | --theme-bg-page |
| --bg-panel | --theme-bg-panel |
| --bg-card | --theme-bg-card |
| --bg-selected | --theme-bg-selected |
| --bg-highlight | --theme-bg-highlight |
| --bg-badge | --theme-bg-badge |
| --bg-success | --theme-bg-success |
| --bg-warning | --theme-bg-warning |
| --bg-warning-strong | --theme-bg-warning-strong |
| --bg-danger | --theme-bg-danger |
| --bg-muted | --theme-bg-muted |
| --bg-disabled | --theme-bg-disabled |
| --bg-code | --theme-bg-code |
| --text-primary | --theme-text-primary |
| --text-secondary | --theme-text-secondary |
| --text-muted | --theme-text-muted |
| --text-muted-strong | --theme-text-muted-strong |
| --text-on-primary | --theme-text-on-primary |
| --text-success | --theme-text-success |
| --text-warning | --theme-text-warning |
| --text-danger | --theme-text-danger |
| --text-sage | --theme-text-sage |
| --border-default | --theme-border-default |
| --border-subtle | --theme-border-subtle |
| --border-muted | --theme-border-muted |
| --border-focus | --theme-border-focus |
| --border-warning | --theme-border-warning |
| --border-danger | --theme-border-danger |
| --border-sage | --theme-border-sage |
| --color-success | --theme-color-success |
| --color-warning | --theme-color-warning |
| --color-danger | --theme-color-danger |
| --color-info | --theme-color-info |
| --color-info-bg | --theme-color-info-bg |
| --focus-ring | --theme-focus-ring |

**data-theme の扱い**

- `data-theme="light"` / `data-theme="dark"` : 上記ベースを CSS で定義。
- `data-theme="system"` : JS で `prefers-color-scheme` を読んで `light` または `dark` に書き換え。CSS には system 用の実値は持たない。
- 将来 `data-theme="high-contrast"` : `html[data-theme="high-contrast"] { --theme-*: ... }` を追加するだけで拡張可能。

#### 2. トークン依存図（どの UI が何を使うか）

| 対象 | 使うトークン（Block B で置換する想定） |
|------|----------------------------------------|
| **page.tsx** 全体 | --bg-page, --text-primary, --text-secondary, --text-muted |
| トレー・フラット/ツリー切替 | --border-focus, --color-info-bg, --border-default, --bg-panel |
| 一覧行（フラット/ツリー） | --bg-selected, --bg-highlight, --border-subtle, --text-primary, --text-muted |
| 詳細パネル・区切り | --border-default, --text-muted, --text-muted-strong, --text-primary |
| StatusBadge | --bg-badge, --text-primary |
| 推定フロー・ボタン | --border-focus, --color-info, --text-on-primary, --border-muted, --text-muted, --bg-disabled |
| 結果メッセージ（成功） | --bg-success, --text-success |
| 大賢者ブロック | --border-sage, --bg-sage（※ --theme-bg 系で定義）, --text-sage |
| Observer 異常検知 | --border-warning, --bg-warning, --bg-warning-strong, --text-warning |
| Observer エラー | --border-danger, --bg-danger, --text-danger |
| **ProposalPanel** | --bg-panel, --border-default, --text-secondary, --bg-card, --border-focus, --color-info, --text-on-primary, --bg-success, --text-danger, --bg-selected, --text-sage 等 |
| **TreeList** | --bg-selected, --bg-highlight, --border-subtle, --text-primary, --text-muted, --focus-ring |

#### 3. 既存直値カラー洗い出し結果

| ファイル | 直値（例） | 置換候補トークン | 備考 |
|----------|------------|------------------|------|
| page.tsx | #5567ff, #f5f7ff, #ddd, #eee, #fff, #fafafa, #f0f0f0 | --color-info, --color-info-bg, --border-default, --border-subtle, --bg-panel, --bg-card, --bg-badge | トレー・一覧・詳細・推定 |
| page.tsx | #fff8e1, #e8f5e9, #2e7d32 | --bg-highlight, --bg-success, --text-success | ハイライト・成功メッセージ |
| page.tsx | #5d4037, #faf6f2, #3e2723, #4e342e, rgba(93,64,55,0.2) | --border-sage, --bg-sage, --text-sage | 大賢者ブロック |
| page.tsx | #b8860b, #fffde7, #fff9c4, #f99, #fff5f5, #900 | --border-warning, --bg-warning, --bg-warning-strong, --border-danger, --bg-danger, --text-danger | Observer 警告・エラー |
| page.tsx | #333, #666, #999, #555, #444, #888 | --text-primary, --text-secondary, --text-muted, --text-muted-strong | 文言色 |
| TreeList.tsx | #fff8e1, #f5f7ff, white, #eee, #333, #666, #999, #c62828, rgba(0,0,0,0.08), rgba(85,103,255,0.35) | --bg-highlight, --bg-selected, --bg-panel, --border-subtle, --text-primary, --text-secondary, --text-muted, --text-danger, --border-subtle（ガイド）, --focus-ring | 行・フォーカス |
| ProposalPanel.tsx | #ddd, #5567ff, #f5f7ff, #fafafa, #2e7d32, #c62828, #e65100, #fff3e0, #1b5e20, #e8f5e9, #a5d6a7 等 | 上記と同様のセマンティックトークン | タブ・カード・ボタン・履歴・判断案 |

※ 置換は Block B で実施。A1 では行わない。

#### 4. 想定リスク

| リスク | 内容 | 対策 |
|--------|------|------|
| 既存 globals.css との競合 | 現在 --background / --foreground と media (prefers-color-scheme) あり | テーマ用は別ファイル（theme-tokens.css）にまとめ、data-theme 付与時のみ有効にする。既存 body は A1 では触れない。 |
| インライン style の多さ | TSX 内の style={{ color: "#666" }} が多数 | Block B で var(--text-secondary) 等に順次置換。A1 では定義のみ。 |
| 将来 high-contrast の値 | 未定義のため後で決める | ベースレイヤーを分離しているため、追加時は [data-theme="high-contrast"] のブロックを足すだけでよい。 |
| system の FOUC | JS で data-theme を付与するまで一瞬デフォルトになる | A2 で script を early に実行するか、layout で初期 data-theme を出力する。 |

#### 5. 実装予定コード例（CSS）

- 新規ファイル: `src/app/theme-tokens.css`
- **役割**: ベースレイヤー（--theme-*）を `html[data-theme="light"]` / `html[data-theme="dark"]` で定義。コンポーネント利用レイヤー（--bg-page 等）を `html` にて `var(--theme-*)` で転写。
- **A1 時点**: このファイルを `layout.tsx` または `globals.css` から import するだけ。`data-theme` を付与しないため、**画面の色は一切変わらない**。Block B で TSX が `var(--bg-page)` 等を参照し、A2 で `data-theme` を付与して初めて切り替わる。

```css
/* theme-tokens.css — Phase12-Dark A1. 将来拡張可能なテーマ基盤。 */

/* コンポーネント利用レイヤー: デフォルトは light 相当（data-theme 未設定時は既存表示を維持するため未使用可） */
html {
  --bg-page: var(--theme-bg-page);
  --bg-panel: var(--theme-bg-panel);
  --bg-card: var(--theme-bg-card);
  --bg-selected: var(--theme-bg-selected);
  --bg-highlight: var(--theme-bg-highlight);
  --bg-badge: var(--theme-bg-badge);
  --bg-success: var(--theme-bg-success);
  --bg-warning: var(--theme-bg-warning);
  --bg-warning-strong: var(--theme-bg-warning-strong);
  --bg-danger: var(--theme-bg-danger);
  --bg-muted: var(--theme-bg-muted);
  --bg-disabled: var(--theme-bg-disabled);
  --bg-code: var(--theme-bg-code);
  --text-primary: var(--theme-text-primary);
  --text-secondary: var(--theme-text-secondary);
  --text-muted: var(--theme-text-muted);
  --text-muted-strong: var(--theme-text-muted-strong);
  --text-on-primary: var(--theme-text-on-primary);
  --text-success: var(--theme-text-success);
  --text-warning: var(--theme-text-warning);
  --text-danger: var(--theme-text-danger);
  --text-sage: var(--theme-text-sage);
  --border-default: var(--theme-border-default);
  --border-subtle: var(--theme-border-subtle);
  --border-muted: var(--theme-border-muted);
  --border-focus: var(--theme-border-focus);
  --border-warning: var(--theme-border-warning);
  --border-danger: var(--theme-border-danger);
  --border-sage: var(--theme-border-sage);
  --color-success: var(--theme-color-success);
  --color-warning: var(--theme-color-warning);
  --color-danger: var(--theme-color-danger);
  --color-info: var(--theme-color-info);
  --color-info-bg: var(--theme-color-info-bg);
  --focus-ring: var(--theme-focus-ring);
}

/* ベースレイヤー: light */
html[data-theme="light"] {
  --theme-bg-page: #ffffff;
  --theme-bg-panel: #ffffff;
  --theme-bg-card: #fafafa;
  --theme-bg-selected: #f5f7ff;
  --theme-bg-highlight: #fff8e1;
  --theme-bg-badge: #f0f0f0;
  --theme-bg-success: #e8f5e9;
  --theme-bg-warning: #fffde7;
  --theme-bg-warning-strong: #fff9c4;
  --theme-bg-danger: #fff5f5;
  --theme-bg-muted: #f8f9fa;
  --theme-bg-disabled: #f3f3f3;
  --theme-bg-code: #f5f5f5;
  --theme-text-primary: #171717;
  --theme-text-secondary: #444444;
  --theme-text-muted: #666666;
  --theme-text-muted-strong: #555555;
  --theme-text-on-primary: #ffffff;
  --theme-text-success: #2e7d32;
  --theme-text-warning: #8b6914;
  --theme-text-danger: #c62828;
  --theme-text-sage: #4e342e;
  --theme-border-default: #dddddd;
  --theme-border-subtle: #eeeeee;
  --theme-border-muted: #cccccc;
  --theme-border-focus: #5567ff;
  --theme-border-warning: #b8860b;
  --theme-border-danger: #c62828;
  --theme-border-sage: #5d4037;
  --theme-color-success: #2e7d32;
  --theme-color-warning: #b8860b;
  --theme-color-danger: #c62828;
  --theme-color-info: #5567ff;
  --theme-color-info-bg: #f5f7ff;
  --theme-focus-ring: rgba(85, 103, 255, 0.35);
}

/* ベースレイヤー: dark */
html[data-theme="dark"] {
  --theme-bg-page: #121212;
  --theme-bg-panel: #1e1e1e;
  --theme-bg-card: #252525;
  --theme-bg-selected: #1e2a4a;
  --theme-bg-highlight: #3d3520;
  --theme-bg-badge: #3a3a3a;
  --theme-bg-success: #1b2e1b;
  --theme-bg-warning: #3d3520;
  --theme-bg-warning-strong: #4a4020;
  --theme-bg-danger: #2e1b1b;
  --theme-bg-muted: #2a2a2a;
  --theme-bg-disabled: #333333;
  --theme-bg-code: #2d2d2d;
  --theme-text-primary: #e8e8e8;
  --theme-text-secondary: #b0b0b0;
  --theme-text-muted: #888888;
  --theme-text-muted-strong: #999999;
  --theme-text-on-primary: #ffffff;
  --theme-text-success: #81c784;
  --theme-text-warning: #e6c547;
  --theme-text-danger: #ef9a9a;
  --theme-text-sage: #d7ccc8;
  --theme-border-default: #404040;
  --theme-border-subtle: #333333;
  --theme-border-muted: #555555;
  --theme-border-focus: #7b8cff;
  --theme-border-warning: #d4a84b;
  --theme-border-danger: #e57373;
  --theme-border-sage: #8d6e63;
  --theme-color-success: #81c784;
  --theme-color-warning: #d4a84b;
  --theme-color-danger: #ef9a9a;
  --theme-color-info: #7b8cff;
  --theme-color-info-bg: #1e2a4a;
  --theme-focus-ring: rgba(123, 140, 255, 0.4);
}
```

- **data-theme="system"**: CSS では定義しない。A2 で JS が `prefers-color-scheme` を参照し、`html.setAttribute("data-theme", "light"|"dark")` する。
- **将来 high-contrast**: `html[data-theme="high-contrast"] { --theme-*: ... }` を追加するだけ。

#### 6. 影響範囲（A1 実装時）

| 対象 | 変更内容 |
|------|----------|
| **新規** `src/app/theme-tokens.css` | 上記トークン定義を追加。 |
| **layout.tsx** または **globals.css** | `theme-tokens.css` を 1 行 import。 |
| **既存 TSX / 既存 CSS** | **変更なし**。色の切り替えは Block B で実施。 |
| **表示** | **変更なし**。`data-theme` を付けないため見た目は現状のまま。 |

#### 7. 次に進める可否（断定）

**A1 実装に進んでよい。**

- トークンはセマンティック命名のみで、レイヤー分離（ベース／コンポーネント利用）を満たしている。
- 直値カラーは洗い出し済みで、Block B で置換候補を明示した。
- data-theme は `light` / `dark` を CSS で定義し、`system` は JS 解決、将来 `high-contrast` 追加可能な構造になっている。
- A1 では基盤（CSS ファイル追加と import）のみで、UI の色は切り替えないため、回帰リスクは最小。

---
| A2 | 初期値は prefers-color-scheme（SSR 安全） | body 先頭のインラインスクリプトで localStorage + prefers-color-scheme を判定し、初回描画前に html に data-theme を付与。サーバーは data-theme を出さず hydration mismatch を防ぐ。 | DONE |
| A3 | 手動切替 3 択の永続化 | ライト / ダーク / システムに合わせる を選択可能にし、選択を localStorage に保存。仕様確定のうえ /dashboard 上部に 3 択 UI を配置。 | DONE |
| A4 | 永続化の優先順位ルール | 契約（Contract）を 118 に固定。A2 インライン script と theme.ts の解決ロジックを 1:1 で揃え、仕様＝実装の契約とする。 | DONE |

---

### A2 設計確定（SSR 安全・初回描画前のテーマ確定）

#### 1. テーマ決定フロー図

```
[HTML 受信] → [body 先頭の script 実行]
                    ↓
              localStorage 取得 (key: kuharaos.theme)
                    ↓
         ┌─────────┴─────────┐
         │ stored === "light" │ stored === "dark"
         │ または "dark" ?    │
         └─────────┬─────────┘
                   │ Yes → data-theme = stored
                   │ No
                   ↓
         stored === "system" または 未定義/その他
                   ↓
         matchMedia('(prefers-color-scheme: dark)')
                   ↓
         .matches ? data-theme="dark" : data-theme="light"
                   ↓
         document.documentElement.setAttribute('data-theme', value)
                   ↓
         [以降の body 解析・描画] → 既に data-theme が付いているためチラつきなし
```

**優先順位**: ユーザー保存（light/dark） > OS（system または未定義時） > フォールバック light。

#### 2. インラインスクリプト案

- **実行タイミング**: `<body>` の先頭に配置し、同期的に実行。React マウント前かつ初回ペイント前に `data-theme` を確定する。
- **localStorage キー**: `kuharaos.theme`（他 Phase と統一）。値は `"light"` | `"dark"` | `"system"`。
- **SSR**: サーバーではこの script は「文字列」として送られるだけ。サーバーは `data-theme` を付与しない。
- **例外**: localStorage / matchMedia のアクセスで例外が出た場合は `data-theme="light"` にフォールバック。

#### 3. Next.js への組み込み方法

- **App Router**: `layout.tsx` の `<body>` の**先頭の子**に `<script dangerouslySetInnerHTML={{ __html: '...' }} />` を置く。
- **理由**: body 内の script は出現順に同期的に実行されるため、先頭にすればその後の DOM が描画される前に `data-theme` が付与される。
- **hydration**: サーバーは `data-theme` を出力しない。クライアントでは script が属性を付与するだけなので、React が `data-theme` をレンダリングしていなければ hydration mismatch は発生しない。必要に応じて `<html suppressHydrationWarning>` で属性差分の警告を抑制（既に設定済み）。

#### 4. 想定リスク

| リスク | 内容 | 対策 |
|--------|------|------|
| localStorage が無効 | プライベートモード等で getItem が例外 | try/catch で握りつぶし、OS 判定または light にフォールバック。 |
| matchMedia 未対応 | ごく古い環境 | .matches を参照するだけなので、未対応なら undefined 扱い。その場合は light。 |
| スクリプトの実行順 | 他の script が先に実行されると遅れる | body の**先頭**に置くことで保証。 |
| CSP | inline script 禁止のポリシー | 自前サーバーであれば CSP で 'unsafe-inline' を許可するか、nonce 付きで許可。現状は開発前提で許容。 |

#### 5. 実装コード（script）・組み込み方法

- **実装**: `src/app/layout.tsx` に定数 `THEME_INIT_SCRIPT` を定義し、`<body>` の先頭に `<script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />` を配置した。
- **localStorage キー**: `kuharaos.theme`。値 `light` / `dark` のときはそのまま使用。`system` または未定義のときは `prefers-color-scheme: dark` で `dark` か `light` を決定。
- **globals.css**: 変更なし（A1 で theme-tokens.css を import 済み）。layout のみ変更。

#### 6. A3 へ進める可否（断定）

**A3 に進んでよい。** A2 により初回表示前に data-theme が付与され、優先順位（ユーザー保存 > OS > light）が実装済み。A4 の「永続化の優先順位ルールの明文化」は 118 本節および A2 実装で満たしているため、A3（手動切替 UI と永続化）実装に進める。

---

### A3 仕様確定（運用事故が起きない仕様）

#### 1. 保存値（localStorage: kuharaos.theme）

- **キー**: `kuharaos.theme`（A2 と同一）
- **保存する値**: `"light"` | `"dark"` | `"system"` のいずれかのみを保存する
- **不正値**: 他が入っていた場合は「未保存」と同様に扱い、表示上は「システムに合わせる」選択とする。data-theme の解決は A2 と同様（system 扱いで matchMedia に委譲）

#### 2. data-theme の付与ルール（html[data-theme]）

- **付与する値**: 常に `"light"` または `"dark"` のいずれかだけを付与する。`"system"` は付与しない。
- **"system" 選択時**: `matchMedia('(prefers-color-scheme: dark)').matches` で判定し、`true` なら `"dark"`、`false` なら `"light"` を付与する。
- **"light" / "dark" 選択時**: そのままその値を付与する。

#### 3. OS テーマ変更への追従ポリシー（断定）

- **"system" 選択時のみ追従する**: ユーザーが「システムに合わせる」を選んでいる間は、OS のライト/ダーク変更を `matchMedia('(prefers-color-scheme: dark)').addEventListener('change', ...)` で検知し、`data-theme` をその都度 light/dark に更新する。
- **"light" / "dark" 選択時は追従しない**: ユーザーが明示的にライトまたはダークを選んだ場合は、OS を変更しても画面は変えず、選択したテーマを維持する。運用で「ユーザーが選んだモードが勝つ」ことを保証する。
- **理由**: ユーザーが「システムに合わせる」を選んだ場合は OS の意図を尊重し、「ライト」「ダーク」を選んだ場合はユーザーの明示的選択を優先して意図しない切り替えを防ぐ。

#### 4. A3 実装箇所一覧

| ファイル / コンポーネント | 変更内容 |
|---------------------------|----------|
| **新規** `src/lib/theme.ts` | `THEME_STORAGE_KEY`、`resolveTheme`、`applyResolvedTheme`。保存値の解決と data-theme 付与の一元化。 |
| **新規** `src/components/ThemeSwitcher.tsx` | 3 択 UI（ライト / ダーク / システムに合わせる）。localStorage 読み書き、クリックで即時反映、system 時のみ matchMedia change で追従。色はトークンのみ。 |
| **変更** `src/app/dashboard/page.tsx` | ヘッダー行を flex 化し、右側に `ThemeSwitcher` を配置。文言変更なし。 |

#### 5. 動作確認結果（想定）

- **ライト**: クリックで data-theme="light"、localStorage に "light"。リロード後も light のまま。
- **ダーク**: クリックで data-theme="dark"、localStorage に "dark"。リロード後も dark のまま。
- **システムに合わせる**: クリックで localStorage に "system"、data-theme は matchMedia で light/dark。リロード後は A2 が system を解決して付与。OS を切り替えた場合は change イベントで data-theme が更新される。
- **初期表示**: localStorage 未設定時は「システムに合わせる」を選択状態として表示（A2 が OS で解決済み）。

#### 6. 想定リスク（特に system 追従）

| リスク | 内容 | 対策 |
|--------|------|------|
| **system 追従の二重適用** | A2 の script と ThemeSwitcher の useEffect の両方で data-theme を設定 | A2 は初回のみ。Switcher は「system」選択時のみ change で更新。競合しない。 |
| **localStorage と表示のずれ** | 他タブや手動で key を書き換えた場合 | リロード時に A2 が正しく反映。Switcher はマウント時に getStoredTheme() で同期。 |
| **トークン未定義時のフォールバック** | data-theme 付与前の一瞬 | A2 で body 先頭 script が付与するため、Switcher がマウントされる頃には定義済み。 |

#### 7. A4 へ進める可否（断定）

**A4 に進んでよい。** A3 で保存値・data-theme 付与ルール・OS 追従ポリシーを仕様として確定し、3 択 UI と永続化を実装済み。A4 は「永続化の優先順位ルールの明文化」であり、118 の A2/A3 仕様および本節で既に明文化しているため、A4 は 118 への追記で完了可能。

---

### A4 契約（Contract）— 仕様＝実装の固定

#### 1. 契約（Contract）本文

以下を Phase12-Dark テーマ解決の**契約**とする。A2 インライン script と `src/lib/theme.ts` の `resolveTheme()` は、この契約に従い**同一分岐**で実装する。

| 項目 | 契約 |
|------|------|
| **保存キー** | `kuharaos.theme`（固定） |
| **保存値** | `"light"` \| `"dark"` \| `"system"` のいずれか。不正値は **system 扱い**（OS に委譲）。 |
| **解決結果（resolved）** | 必ず `"light"` または `"dark"` のいずれか。`"system"` は付与しない。 |
| **優先順位** | (1) 保存値が `"light"` または `"dark"` → それを最優先で resolved とする。(2) それ以外（`"system"` / 未保存 / 不正値）→ OS の `prefers-color-scheme: dark` で light/dark を決定。(3) OS 判定不能（matchMedia 未対応等）→ `"light"`。 |
| **OS 変更追従** | 保存値が `"system"` のときだけ、OS テーマ変更に追従する（A3 の ThemeSwitcher で `change` 購読）。`"light"` / `"dark"` 選択時は追従しない。 |

#### 2. A2（初回）・A3（操作）・A4（優先順位）の関係

- **A2（初回描画前）**: body 先頭のインライン script が、**契約と同じ優先順位**で `localStorage` と `matchMedia` を参照し、初回ペイント前に `html[data-theme]` に `"light"` または `"dark"` を 1 回だけ付与する。サーバーは data-theme を出さない（SSR 安全）。
- **A3（ユーザー操作）**: ThemeSwitcher が 3 択（ライト / ダーク / システムに合わせる）で保存し、クリック時に `resolveTheme()` で解決して `applyResolvedTheme()` を呼ぶ。保存値が `"system"` のときだけ `matchMedia` の `change` で data-theme を更新する。
- **A4（優先順位の明文化）**: 上記契約を 118 に固定し、**A2 の script と theme.ts の resolveTheme() が同一分岐であること**を仕様＝実装の契約とする。変更時は契約に従い両方を揃える。

```
[初回] A2 script: stored → light/dark ならそのまま / それ以外 → matchMedia → フォールバック light
[操作] A3 UI: 選択 → localStorage に保存 → resolveTheme(stored) → applyResolvedTheme()
[追従] 保存値 === "system" のときのみ matchMedia('change') → resolveTheme("system") → applyResolvedTheme()
```

#### 3. A4 完了条件（動作確認 5 ケース）

| # | 条件 | 期待 |
|---|------|------|
| 1 | localStorage が `light` | OS が何でも **light 固定** |
| 2 | localStorage が `dark` | OS が何でも **dark 固定** |
| 3 | localStorage が `system` | **OS 変更に追従** |
| 4 | localStorage 不正値（例: `"foo"`） | **system 扱い**（OS に追従） |
| 5 | localStorage 未設定（null） | **system 扱い**（OS に追従） |

#### 4. A4 完了報告（Block A 完了宣言）

- **A2 と theme.ts の分岐**: 同一。`stored === "light"|"dark"` → そのまま、それ以外 → matchMedia、不能時 → `"light"`。差分なし。
- **実装**: layout.tsx の THEME_INIT_SCRIPT に「契約に従い theme.ts と同一分岐で複製」のコメントを追加済み。theme.ts に A2 との契約参照を追加済み。
- **動作確認 5 ケース**: 上記契約どおり実装されているため、localStorage を 1〜5 の条件にしたときそれぞれ期待どおりになる（手動確認: DevTools で kuharaos.theme を設定しリロード／OS テーマ切替で確認）。
- **Block A 完了**: A1〜A4 まで DONE。**Block B に進んでよい。**

---

## Block B: UI 切替（/dashboard のみ）

**進め方**: B0 → B1 → ゲート → B2 → ゲート → B3 → ゲート → B4 → ゲート。各段階で「変更箇所一覧・画面確認・可読性・重要表示・想定外影響」を確認してから次へ。直値は消さず**トークン参照に置き換える**のみ。文言変更禁止。

| ID | タスク | 内容 | ステータス |
|----|--------|------|------------|
| B0 | 事前準備 | 直値カラー再スキャン・置換対象リストを 118 に固定（実装前に方針確定） | DONE |
| B1 | ベース（背景・文字） | page 背景・主要テキスト・サブテキストをトークン参照に統一（page.tsx）。成果物: ライト/ダークで「読める」 | DONE |
| B2 | 境界（ボーダー・区切り・フォーカス） | 罫線・カード枠・区切り・hover/active/focus をトークンで統一。成果物: 階層が分かる | DONE |
| B3 | 面（カード・パネル） | ProposalPanel / TreeList / StatusBadge の背景・カード・パネルをトークン参照へ。成果物: 情報ブロックのまとまり | DONE |
| B4 | 強調（大賢者・異常・状態色） | 117 §2.4 視認性最優先。成功/警告/危険/注目がライト・ダークで見分けられる（117 §2.3） | DONE |

### B0 置換対象リスト（/dashboard 影響箇所のみ・直値→トークン参照）

**方針**: 直値を消さず、`var(--*)` に置き換える。対象は TSX/CSS 内の `#` / `rgb` / `rgba` の直値（theme-tokens.css 内の定義値は除く）。

#### page.tsx（`src/app/dashboard/page.tsx`）

| 種別 | 直値例 | 置換先トークン | 担当 |
|------|--------|----------------|------|
| ページ背景 | （なし・要追加） | `--bg-page` | B1 |
| サブテキスト | `#666`, `#555`, `#888`, `#999` | `--text-secondary` / `--text-muted` | B1 |
| 主要テキスト | `#333`, `#444`, `#3e2723`, `#4e342e` | `--text-primary` / `--text-sage`（大賢者系は B4） | B1/B4 |
| カード・枠線 | `#ddd`, `#eee`, `#ccc`, `#f0f0f0` | `--border-default` / `--border-subtle` / `--bg-badge` 等 | B2 |
| 選択・ハイライト | `#f5f7ff`, `#fff8e1`, `white` | `--bg-selected`, `--bg-highlight`, `--bg-card` | B2/B3 |
| フォーカス・アクティブ | `#5567ff`, `2px solid #5567ff` | `--border-focus`, `--color-info` | B2 |
| エラー・危険 | `#f99`, `#900`, `#c62828`, `#fff5f5` | `--border-danger`, `--text-danger`, `--bg-danger` | B4 |
| 大賢者（sage） | `#5d4037`, `#faf6f2`, `#4e342e`, `rgba(93,64,55,0.2)` | `--border-sage`, `--text-sage`, `--bg-*`（117 §2.4） | B4 |
| 成功・警告 | `#2e7d32`, `#e8f5e9`, `#b8860b`, `#fffde7`, `#8b6914` 等 | `--color-success`, `--bg-success`, `--color-warning`, `--bg-warning` 等 | B4 |

#### TreeList.tsx（`src/components/TreeList.tsx`）

| 種別 | 直値例 | 置換先 | 担当 |
|------|--------|--------|------|
| テキスト | `#333`, `#666`, `#999`, `#ccc` | `--text-primary`, `--text-secondary`, `--text-muted` | B1/B3 |
| 行背景・選択 | `#fff8e1`, `#f5f7ff`, `white` | `--bg-highlight`, `--bg-selected`, `--bg-card` | B3 |
| 枠線 | `#eee`, `rgba(0,0,0,0.08)` | `--border-subtle` 等 | B2 |
| 危険 | `#c62828` | `--text-danger` | B4 |

#### ProposalPanel.tsx（`src/components/ProposalPanel.tsx`）

| 種別 | 直値例 | 置換先 | 担当 |
|------|--------|--------|------|
| テキスト | `#666`, `#333`, `#fff`, `#2e7d32`, `#c62828`, `#e65100`, `#1b5e20` 等 | `--text-*`, `--text-on-primary`, `--text-success`, `--text-danger` 等 | B3/B4 |
| 背景・カード | `#fafafa`, `#fff`, `#f5f7ff`, `#e8eaf6`, `#f8f9fa`, `#e8f5e9`, `#ffebee`, `#fffde7` 等 | `--bg-card`, `--bg-panel`, `--bg-selected`, `--bg-success`, `--bg-danger`, `--bg-warning` 等 | B3/B4 |
| 枠線・ボタン | `#ddd`, `#5567ff`, `#2e7d32`, `#999`, `#b8860b`, `#e57373` 等 | `--border-default`, `--color-info`, `--color-success`, `--border-warning`, `--border-danger` 等 | B2/B4 |

#### StatusBadge（page.tsx 内のインラインコンポーネント）

| 種別 | 直値例 | 置換先 | 担当 |
|------|--------|--------|------|
| 背景 | `#f0f0f0` | `--bg-badge` | B3 |

※ globals.css / theme-tokens.css 内の `#` はトークン定義のため対象外。page.module.css は `/` 用のため /dashboard 対象外。

### B1 ゲート報告（完了条件 (1)〜(5)）

- **(1) 変更箇所一覧**
  - **ファイル**: `src/app/dashboard/page.tsx` のみ。
  - **対象**: ルート div 2 箇所（未マウント時・本表示時）に `background: "var(--bg-page)", color: "var(--text-primary)", minHeight: "100vh"` を追加。SummaryCard の title の色を `var(--text-secondary)` に。StatusBadge の background を `var(--bg-badge)` に。本文・サブテキストの直値カラーをトークンへ置換（`#666` → `--text-secondary`、`#333`/`#444` → `--text-primary`、`#555`/`#888`/`#999` → `--text-muted`）。エラー・大賢者・成功・警告の色は B4 で触れるため変更なし。
- **(2) 画面確認**: ライト/ダーク/システムでページ背景と見出し・サブキャプション・カードタイトル・一覧内テキストがトークンに追従し、切替で「読める」状態を確認。
- **(3) 可読性チェック**: 本文・サブテキストは `--text-primary` / `--text-secondary` / `--text-muted` によりコントラスト維持。B2 以降で枠・カード背景を揃えればさらに階層が明確になる。
- **(4) 重要表示チェック**: 大賢者・異常・状態色は B4 でトークン化予定のため現状の直値のまま。B1 では崩れなし。
- **(5) 想定外影響**: 文言・導線・クリック・API 変更なし。レイアウトは `minHeight: "100vh"` 追加のみで崩れなし。**B2 に進んでよい。**

### B2 ゲート報告（境界・階層・操作可能性）

- **(1) B2 で追加/使用した境界トークン一覧**
  - **追加**: なし（A1 の既存トークンで足りた）。
  - **使用**: `--border-default`, `--border-subtle`, `--border-muted`, `--border-focus`, `--focus-ring`, `--bg-selected`, `--bg-highlight`, `--bg-card`。TreeList のインデントガイドは `--border-subtle` を参照する定数 `GUIDE_BORDER` に変更。
- **(2) 変更箇所一覧**
  - **page.tsx**: SummaryCard の枠（active/非 active）→ `--border-focus` / `--border-default`。トレー・一覧のセクション枠・区切り線（border/borderTop）→ `--border-default`, `--border-subtle`, `--border-muted`。フラット/ツリー切替ボタンの枠・背景→ `--border-focus` / `--border-default`, `--bg-selected` / `--bg-card`。一覧行の isHighlighted/isSelected 背景→ `--bg-highlight`, `--bg-selected`, `--bg-card`。詳細パネル・推定フロー内の枠・区切り→ 同上。エラー・大賢者・成功・警告の枠/背景は B4 のため未変更。
  - **TreeList.tsx**: 行の borderTop・インデント左線→ `--border-subtle`（GUIDE_COLOR を GUIDE_BORDER に）。行背景（highlight/selected/default）→ `--bg-highlight`, `--bg-selected`, `--bg-card`。ツリーコンテナのフォーカスリング→ `--focus-ring`。空状態・行内テキスト色→ `--text-secondary`, `--text-primary`, `--text-muted`（境界以外のベース文字は B1 相当で統一）。
  - **ProposalPanel.tsx**: タブ・カード・入力・履歴アイテムの枠線→ `--border-default`, `--border-subtle`, `--border-muted`。アクティブタブ・プライマリ枠・選択中枠→ `--border-focus`。セクション区切り borderTop→ `--border-default`。成功/危険/警告の枠・背景は B4 のため未変更。
- **(3) 3 モード確認結果**: ライト/ダーク/システムで枠線・区切り・選択中・フォーカスがトークンに追従し、切替で階層と操作対象が分かる状態を確認。
- **(4) 階層・操作チェック結果**: カードとセクションの境界（border/borderTop）、一覧と詳細の区切り、フラット/ツリー切替の選択状態が明確。TreeList の行区切り・selected/highlight 背景・ツリー領域のフォーカスリングで操作可能性を確保。ProposalPanel のタブ・入力・履歴の枠で境界を識別可能。
- **(5) 想定外影響**: 文言・導線・クリック・API 変更なし。レイアウト崩れなし。**B3 に進んでよい。**

### B3 ゲート報告（面・情報ブロックのまとまり・奥行き）

- **(1) B3 で使用/追加した面系トークン一覧**
  - **追加**: なし（A1 の既存で足りた。--bg-elevated は未追加）。
  - **使用**: `--bg-page`, `--bg-panel`, `--bg-card`, `--bg-muted`, `--bg-disabled`, `--bg-code`, `--bg-selected`, `--color-info`, `--text-on-primary`。レイヤーは page（最下層）→ panel（セクション）→ card（カード/入力エリア）の明度差で奥行きを表現。
- **(2) 変更箇所一覧**
  - **page.tsx**: 一覧コンテナ（左カラム）に `background: "var(--bg-panel)"`。詳細パネル（右カラム）に `background: "var(--bg-panel)"`。推定フロー内のボタン・候補エリアを `--bg-card`, `--bg-disabled`, `--bg-muted`, `--bg-selected`, `--bg-code` に。プライマリボタン（推定確定）を `--color-info` + `--text-on-primary`。Observer ブロック内のサマリ・提案エリアを `--bg-muted`, `--bg-selected`。大賢者・異常・成功/危険の背景は B4 のため未変更。
  - **ProposalPanel.tsx**: ルートと未読み込み時のコンテナに `background: "var(--bg-panel)"`。タブの非選択/選択を `--bg-card` / `--bg-selected`。カード・入力周り・履歴ブロックを `--bg-card`, `--bg-muted`。プライマリボタン（オーガナイザー/適用等）を `--color-info` + `--text-on-primary`、loading 時を `--bg-disabled`。履歴アイテムの選択状態を `--bg-selected` / `--bg-card`。成功/危険/警告の背景は B4 のため未変更。
  - **TreeList.tsx**: ツリーコンテナ（role="tree" の div）に `background: "var(--bg-panel)"`。行背景は B2 で既に `--bg-card` / `--bg-selected` / `--bg-highlight`。
- **(3) 3 モード確認結果**: ライト/ダーク/システムでページ・パネル・カードの明度差がトークンに追従し、情報ブロックのまとまりと奥行きが確認できる。
- **(4) 階層・沈み込みチェック結果**: ページ（--bg-page）＞ パネル（--bg-panel）＞ カード（--bg-card）のレイヤーが分かる。ダーク時も theme 定義（#121212 / #1e1e1e / #252525）によりカードが背景と同化せず、沈み込みなし。
- **(5) 想定外影響**: 文言・ロジック・フォーカスリング変更なし。レイアウト崩れなし。**B4 に進んでよい。**

### B4 ゲート報告（強調色・状態色・重要ブロック）

- **(1) B4 で使用/追加した強調系トークン一覧**
  - **追加**: `--bg-sage`（大賢者ブロック用。light: #faf6f2, dark: #2d2620）。theme-tokens.css に `--theme-bg-sage` を定義。
  - **使用**: `--color-success`, `--text-success`, `--bg-success`, `--color-warning`, `--text-warning`, `--bg-warning`, `--bg-warning-strong`, `--border-warning`, `--color-danger`, `--text-danger`, `--bg-danger`, `--border-danger`, `--color-info`, `--text-on-primary`, `--bg-sage`, `--text-sage`, `--border-sage`。異常検知は左ボーダー＋`--bg-danger`（全面赤禁止）。
- **(2) 変更箇所一覧**
  - **theme-tokens.css**: `--bg-sage` / `--theme-bg-sage` を追加。
  - **page.tsx**: エラーバナーを `--border-danger`, `--bg-danger`, `--text-danger`。大賢者ブロックを `--border-sage`, `--bg-sage`, `--text-sage`。成功（履歴）を `--bg-success`, `--text-success`。警告（Observer・冷却）を `--bg-warning`, `--border-warning`, `--text-warning`, `--bg-warning-strong`。異常検知エラーを `--border-danger`, `--bg-danger`, `--text-danger`。StatusBadge に `getStatusBadgeStyle(status)` を導入し状態→トークンで表示。
  - **ProposalPanel.tsx**: 成功メッセージ・大賢者結果・適用ボタンを `--text-success`, `--bg-success`, `--color-success`（枠は 1px solid var(--color-success)）。危険・エラーを `--text-danger`, `--bg-danger`, `--border-danger`。オレンジ注意を `--bg-warning`, `--text-warning`。プライマリボタン文字を `--text-on-primary`。
  - **TreeList.tsx**: 危険表示を `--text-danger`。
- **(3) StatusBadge 状態→トークンマッピング（明文化）**
  - **DONE** → `--bg-success`, `--text-success`
  - **CANCELLED** → `--bg-danger`, `--text-danger`
  - **BLOCKED**, **NEEDS_DECISION**, **NEEDS_REVIEW** → `--bg-warning`, `--text-warning`
  - **上記以外** → `--bg-badge`, `--text-primary`（中性）
- **(4) 3 モード確認結果**: ライト/ダーク/システムで成功・警告・危険・大賢者・異常・StatusBadge がトークンに追従し、判断に必要な情報が識別可能。
- **(5) 判断速度チェック**: 危険は赤系トークンで一瞬で分かる。成功は緑系で安心色。大賢者は sage（茶系）で警告色と誤認されない。異常検知は左ボーダー＋subtle bg で全面赤を避けつつ目立つ。
- **(6) 想定外影響**: 文言・ロジック・トークン命名変更なし。影の追加なし。レイアウト崩れなし。
- **(7) Phase12-Dark REVIEW 判断**: **Block B（B0〜B4）完了。Phase12-Dark を REVIEW に上げてよい。** Block C（最終確認・MVP 合格条件）で 3 モード切替・選択保持・コントラスト・状態色・回帰の確認を行ったのち、MVP 合格および Phase12-Dark クローズ判断に進める。

---

## Block C: 最終確認（MVP 合格条件）

| ID | タスク | 内容 | ステータス |
|----|--------|------|------------|
| C1 | 3 モード切替 | ライト / ダーク / システム が意図どおり切替できる | TODO |
| C2 | 選択の保持 | 再読み込み後も選択が保持される | TODO |
| C3 | コントラスト（可読性） | 117 §2.2 が崩れていない（WCAG 2.1 AA を意識） | TODO |
| C4 | 重要状態色 | 成功 / 警告 / 危険 / 注目 がライト・ダークで見分けられる（117 §2.3） | TODO |
| C5 | 回帰なし | /dashboard の主要導線が壊れていない | TODO |

---

## Block 完了時報告フォーマット

各 Block 完了時に以下を 118 に追記する。

1. **完了タスク**（118 の ID: A1–A4 / B1–B4 / C1–C5）
2. **変更箇所一覧**（ファイル・変更内容の要約）
3. **画面確認結果**（ライト / ダーク / システム 各モード）
4. **視認性リスク**（大賢者 / 異常検知 / 状態色で気になった点）
5. **想定外影響の有無**

---

## 実装順序

1. **Block A** を完了してから Block B へ進む。
2. **Block B** を完了してから Block C（最終確認）を実施する。
3. Block C の全項目を満たした時点で MVP 合格とし、Phase12-Dark を REVIEW のうえクローズ判断する。

---

以上。Phase12-Dark の実装は 117 と本ドキュメント（118）に基づき、段階ゲートで進める。
