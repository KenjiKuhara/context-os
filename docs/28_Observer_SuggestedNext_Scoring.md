# 28_Observer_SuggestedNext_Scoring.md
## suggested_next スコアリング仕様（Phase 3-4）— SSOT

---

## 0. 目的

**「今なにやる？」** に返す 1 件の **suggested_next** を、  
「人が動く」提案になるよう **スコアリング方式** で選定する。  
本ドキュメントがスコア・候補除外・欠損値・tie-break・debug の **Single Source of Truth** とする。

---

## 1. 候補除外（suggested_next 対象外）

- **status** が **DONE / CANCELLED / COOLING** の Node は suggested_next の候補から除外する。
- 候補が 0 件のときは **suggested_next = null** とする。**summary は従来どおり出力する。**

---

## 2. updated_at の定義（SSOT）

- **dashboard API** が返す **node.updated_at** を使用する（history などは見ない）。
- **node.updated_at** が無い場合は **node.created_at** を使う。
- **どちらも無い** 場合は「更新が古い扱い」とし、**stale 判定を true** とする（7 日以上前と同様に加点する）。

---

## 3. temperature の欠損時

- **temperature** が null / undefined の場合は **50** とみなす（temp 加点なし。50 > 40 のため）。
- **temperature** が文字列の場合は **数値化してから** 判定する。

---

## 4. スコア付与ルール

| 条件 | 加点 | breakdown のキー |
|------|------|------------------|
| temperature ≤ 40 | +30 | temp |
| updated_at/created_at が 7 日以上前、または日付なし | +25 | stale |
| status = WAITING_EXTERNAL | +20 | status_bonus |
| status = CLARIFYING | +15 | status_bonus |
| status = IN_PROGRESS かつ 3 日以上更新なし | +15 | stuck |
| status = READY | +10 | status_bonus |
| status = NEEDS_DECISION | +12 | status_bonus |
| status = BLOCKED | +8 | status_bonus |

複数満たす場合は **合計** で比較する。

---

## 5. スコアの内訳を必ず残す（デバッグ用）

suggested_next が非 null のとき、**suggested_next.debug** を次の形で必ず付与する。

```json
{
  "total": 45,
  "breakdown": {
    "temp": 0,
    "stale": 25,
    "status_bonus": 20,
    "stuck": 0
  },
  "rule_version": "3-4.0"
}
```

- **total**: 上記ルールの合計点。
- **breakdown.temp**: temperature による加点（0 または 30）。
- **breakdown.stale**: 7 日以上前 or 日付なしによる加点（0 または 25）。
- **breakdown.status_bonus**: status による加点の合計（0 または WAITING_EXTERNAL 20, CLARIFYING 15, READY 10, NEEDS_DECISION 12, BLOCKED 8 のいずれか／複数は該当しない）。
- **breakdown.stuck**: IN_PROGRESS かつ 3 日以上更新なし（0 または 15）。
- **rule_version**: 固定文字列 `"3-4.0"`。

status_proposals の各要素に debug（total / breakdown）を付与してもよい（optional）。

---

## 6. 同点のときの決め方（安定化）

次の順で比較し、**1 件** を選ぶ。

1. **total score 降順**
2. 次に **updated_at が古い順**（effective_updated_at 昇順。日付なしは最後）
3. 最後に **node_id の辞書順**（昇順）

---

## 7. next_action テンプレート（最低 4 つ）

status ごとに「人が動く」文言を出す。最低でも次の 4 種を用意する。

| status | 方針 | next_action（テンプレ例） |
|--------|------|---------------------------|
| WAITING_EXTERNAL | 相手に確認する（メール/電話/メッセージ）系 | 「{title}」の相手に確認する（メール・電話・チャットのどれか 1 本） |
| CLARIFYING | 不明点を 1 つ質問にする系 | 「{title}」の不明点を 1 つだけ質問にまとめる |
| READY | 最初の 10 分タスク系（着手を促す） | 「{title}」の最初の 10 分でできるタスクを 1 つやる |
| IN_PROGRESS | 詰まり確認 or 次の一手系 | 「{title}」で詰まっていないか確認し、次の一手を決める |

その他 status（NEEDS_DECISION, BLOCKED 等）は、上記に合わせた文言か、「context を確認し次の一手を決める」系でよい。

---

## 8. 安全性ガード（絶対）

- **confirm_status** を送らない（**Preview-only** のまま）。
- **Apply / confirmations** を呼ばない。
- 書き込みは **/api/observer/reports** だけ（**--save** のときのみ）。

---

## 9. 成果物

- 本ドキュメント **docs/28_Observer_SuggestedNext_Scoring.md** を作成/更新（スコア仕様・tie-break・欠損値ルール・テンプレ）。
- **agent/observer/main.py** を変更（score 関数・テンプレ・debug 付与・suggested_next 選定）。
- 本ドキュメントに **サンプル 3 ケース**（Node 配列と期待 suggested_next.node_id）を記載する。

---

## 10. サンプル 3 ケース（Node 配列と期待値）

### サンプル 1: WAITING_EXTERNAL ＋ 7 日以上前

**入力 Node 配列（dashboard が返す形に準拠）**

```json
[
  {
    "id": "node-a",
    "title": "A社返信待ち",
    "status": "WAITING_EXTERNAL",
    "temperature": 55,
    "updated_at": "2026-01-30T12:00:00Z",
    "created_at": "2026-01-20T09:00:00Z"
  },
  {
    "id": "node-b",
    "title": "講演資料",
    "status": "IN_PROGRESS",
    "temperature": 70,
    "updated_at": "2026-02-08T10:00:00Z",
    "created_at": "2026-02-01T09:00:00Z"
  }
]
```

**実行日**: 2026-02-09 とする。

**期待**

- **suggested_next.node_id**: **"node-a"**
- **suggested_next.debug.total**: 45
- **suggested_next.debug.breakdown**: temp=0, stale=25, status_bonus=20, stuck=0

（Node A: WAITING_EXTERNAL で +20、10 日以上前で +25 → 45。Node B: 1 日前で stale なし、IN_PROGRESS のみで status_bonus なし、2 日なので stuck なし → 0。）

---

### サンプル 2: temperature ≤ 40 の READY

**入力 Node 配列**

```json
[
  {
    "id": "node-c",
    "title": "企画メモ",
    "status": "READY",
    "temperature": 38,
    "updated_at": "2026-02-07T12:00:00Z",
    "created_at": "2026-02-01T09:00:00Z"
  },
  {
    "id": "node-d",
    "title": "要件整理",
    "status": "CLARIFYING",
    "temperature": 50,
    "updated_at": "2026-02-04T12:00:00Z",
    "created_at": "2026-01-28T09:00:00Z"
  }
]
```

**実行日**: 2026-02-09 とする。

**期待**

- **suggested_next.node_id**: **"node-c"**
- **suggested_next.debug.total**: 40（temp=30, status_bonus=10）。Node D は status_bonus=15 のみで 15。

---

### サンプル 3: 候補が 0 件（すべて DONE/COOLING）

**入力 Node 配列**

```json
[
  { "id": "node-e", "title": "終了タスク", "status": "DONE", "temperature": 20, "updated_at": "2026-02-08T10:00:00Z" },
  { "id": "node-f", "title": "冷却中", "status": "COOLING", "temperature": 35, "updated_at": "2026-02-01T10:00:00Z" }
]
```

**期待**

- **suggested_next**: **null**
- **summary**: 従来どおり出力（例: 「机の上に 2 件のノードがあります。…」）。

---

## 11. 検証観点（Smoke Test 用）

ローカル・本番とも、**25_Smoke_Test.md §12** で次を確認する。  
(1) Observer 実行で stdout に suggested_next が出る（候補 0 件なら null）。  
(2) --save で healthcheck が通り、report_id と summary が latest と一致する。  
(3) GET /api/observer/reports/latest の **report.payload.suggested_next.debug** に **total**（数値）、**breakdown**（temp / stale / status_bonus / stuck の 4 キー）、**rule_version**（"3-4.0"）が含まれること。

---

## 12. 品質ルール（ObserverReport 整合性）

**node_count と summary の件数がズレないようにする** ため、次を守る。

- **node_count の SSOT**: **node_count** は **dashboard から取得した Node 数**（`len(all_nodes)`）を必ず入れる。他で数え直さない。
- **summary の生成**: **summary** の先頭「机の上に N 件のノードがあります」の **N** は **node_count** から生成する（tray の合計を別途計算して N にしない）。同一の node_count を 1 回だけ使い、summary はそれに従う。
- **mismatch 検知**: summary の先頭から抽出した件数と node_count が一致しない場合、**payload.warnings[]** に **SUMMARY_MISMATCH** を追加する。  
  **status 集計の合計** と node_count が一致しない場合は **COUNT_MISMATCH** を追加する。  
  詳細は **docs/29_Observer_Warnings.md** に記載する。
- **payload の形**: **payload.warnings** は `{ code, message, details? }` の配列。0 件のときは `[]`。**payload.node_count** に上記 node_count を入れておく（DB の node_count 列と一致させる）。

---

（以上、Phase 3-4 スコアリング仕様 SSOT）
