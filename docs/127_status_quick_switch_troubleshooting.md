# 127 — 状態クイック切替の失敗時ログ取得

「状態の変更に失敗しました」が出たときの原因確認とログの取り方。

---

## 1. 今回の修正内容（遷移エラー対策）

- **原因**: 状態遷移にはルールがある（例: 外部待ち → 完了 は不可）。許可されていない遷移を押すと API が 422 を返し、画面に「状態の変更に失敗しました」だけ表示されていた。
- **対応**:
  1. **遷移可能なボタンのみ押下可能に**: `getValidTransitions(現在状態)` で、押せる状態だけ有効にした。それ以外は disabled（薄く表示）。
  2. **エラー文言を具体化**: API が返した `error` と、あれば `valid_transitions`（遷移可能な状態のラベル一覧）を表示するようにした。例: 「transition from WAITING_EXTERNAL to DONE is not allowed（遷移可能：着手可能、実施中、障害あり、冷却中、中止）」。

---

## 2. ログの取得方法

### ブラウザ（クライアント）

1. **開発者ツール**を開く（F12 または 右クリック → 検証）。
2. **Network（ネットワーク）** タブを開く。
3. 状態ボタンを押して失敗させる。
4. 一覧から **`estimate-status`** をクリック。
5. **Response（レスポンス）** または **Preview** で JSON を確認する。
   - `ok: false`、`error: "..."` が原因。
   - 422 のときは `valid_transitions: [{ status, label }, ...]` で遷移可能な状態が分かる。

### サーバー（Next.js）

- **ターミナル**: `npm run dev` 実行中のターミナルに、API 内の `console.error` などが出力される。
- **ログを増やしたい場合**: `src/app/api/nodes/[id]/estimate-status/route.ts` の Apply モード内で、`return NextResponse.json({ ok: false, ... })` の直前に `console.error("[estimate-status]", id, currentStatus, confirmStatus, errorMessage)` を追加すると、サーバー側で原因を追いやすい。

---

## 3. よくある失敗パターン

| 状況 | 原因 | 対処 |
|------|------|------|
| 422 transition not allowed | 現在状態から押した状態へは遷移不可 | 薄く表示された（disabled）ボタンは押さない。表示されている「遷移可能：〇〇、△△」のいずれかを選ぶ。 |
| 400 invalid status | 不正な status 文字列 | 通常は起きない。クライアントの送信 body を Network で確認。 |
| 404 node not found | ノードが削除された／別タブで削除された | 一覧を更新してから再度操作。 |
| 500 / ネットワークエラー | DB やサーバー異常 | サーバーログ（ターミナル）を確認。 |

---

以上。127 はトラブルシュート用メモとする。
