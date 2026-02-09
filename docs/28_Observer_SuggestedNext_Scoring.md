# 28_Observer_SuggestedNext_Scoring.md
## suggested_next スコアリング設計（Phase 3-4）

---

## 0. 目的

**「今なにやる？」** に返す 1 件の **suggested_next** を、  
「人が動く」提案になるよう **スコアリング方式** で選定する。

- 候補: アクティブ Node のうち、終了・冷却を除いたもの
- 各ノードにスコアを付け、最高スコア 1 件を suggested_next とする
- スコア内訳は report.payload の **suggested_next.debug** に残し、運用でチューニング可能にする

---

## 1. 候補除外

次の status は **suggested_next の候補から除外** する。

| status    | 理由 |
|----------|------|
| DONE     | 完了済み。次のアクションは別ノード |
| COOLING  | 冷却中。cooling_alerts で別途通知 |
| CANCELLED| 中止済み |

---

## 2. スコア付与ルール（たたき台）

以下の条件を満たすごとに **加算**。複数満たす場合は **合計** で比較する。

| 条件 | 加点 | 意図 |
|------|------|------|
| temperature ≤ 40 | +30 | 冷えかけ＝放置されやすい。早めに「やる／やめる」を決めたい |
| updated_at が 7 日以上前 | +25 | 長く触られていない＝再開 or 整理の判断が必要 |
| status = WAITING_EXTERNAL | +20 | 外部返答の確認という「人がやる」アクションが明確 |
| status = CLARIFYING | +15 | 言語化・整理という「人がやる」アクション |
| status = READY | +10 | 着手可能。次の一手を決める |
| status = IN_PROGRESS かつ 3 日以上更新なし | +15 | 実施中だが止まっている。再開 or 状態変更の判断 |
| status = NEEDS_DECISION | +12 | 判断待ち。人が決断するアクションが明確 |
| status = BLOCKED | +8 | 障害解消策の検討というアクション。READY より少し弱く |

**補足**

- **temperature ≤ 40** と **7 日以上前** は「放置リスク」の二軸。両方満たすと +55 になり、他より強く「まずこれ」になりやすい。
- **NEEDS_DECISION** は READY(10) より高く、CLARIFYING(15) より低い +12 で「判断する」を促す。
- **BLOCKED** は +8 で READY より少し弱く、解消策検討を提案する。

---

## 3. status 別 next_action テンプレート

「人が動く」文言にするため、status ごとに **next_action** をテンプレで出す。

| status | next_action（テンプレ） |
|--------|-------------------------|
| WAITING_EXTERNAL | 「{title}」の外部返答を確認し、必要なら返信や次のアクションを決める |
| CLARIFYING | 「{title}」で何をすべきか整理し、next_action を明確にする |
| READY | 「{title}」に着手し、最初の一手を進める |
| IN_PROGRESS | 「{title}」の context を確認し、次の一手を決める |
| NEEDS_DECISION | 「{title}」の判断材料を確認し、決断する |
| BLOCKED | 「{title}」の障害内容を確認し、解消策を検討する |
| その他 | 「{title}」の context を確認し、次の一手を決める |

`{title}` はノードの title（または name）で置換する。

---

## 4. 出力形（report.payload）

**suggested_next** の形は 19 §4.2 を維持しつつ、**debug** を追加する。

```json
{
  "suggested_next": {
    "node_id": "uuid",
    "title": "ノード名",
    "reason": "外部待ちのノードです",
    "next_action": "「ノード名」の外部返答を確認し、必要なら返信や次のアクションを決める",
    "debug": {
      "score": 50,
      "breakdown": [
        { "label": "temperature_le_40", "points": 30 },
        { "label": "status_WAITING_EXTERNAL", "points": 20 }
      ]
    }
  }
}
```

- **debug** は運用・チューニング用。UI で必須表示しなくてよい。
- 候補が 0 件のときは **suggested_next: null**（debug なし）。

---

## 5. 安全性の維持

- **Preview のみ・Apply なし** は変更しない（confirm_status を送らない）。
- 変更するのは **suggested_next の選定ロジックと next_action 文言・debug の追加** のみ。
- status_proposals / cooling_alerts / summary の算出は従来どおり。

---

## 6. サンプルデータと期待値（ユニット的な検証用）

以下 3 ケースで、**入力ノード一覧 → 期待する suggested_next（node_id / score / reason の方向性）** を記載する。  
実際のユニットテストは、`observe()` の手前で `all_nodes` を差し替えるか、スコア計算関数だけをテストする想定。

### サンプル 1: WAITING_EXTERNAL ＋ 7 日以上前

**入力（要約）**

- Node A: status=WAITING_EXTERNAL, temperature=55, updated_at=10 日前
- Node B: status=IN_PROGRESS, temperature=70, updated_at=1 日前

**期待**

- **suggested_next** は Node A になること。
- **score**: 20 (WAITING_EXTERNAL) + 25 (7 日以上前) = **45**。
- **reason**: 外部待ちであることが分かる文言。
- **next_action**: WAITING_EXTERNAL テンプレ（外部返答を確認し…）。

---

### サンプル 2: temperature ≤ 40 の READY

**入力（要約）**

- Node C: status=READY, temperature=38, updated_at=2 日前
- Node D: status=CLARIFYING, temperature=50, updated_at=5 日前

**期待**

- **suggested_next** は Node C になること。
- **score**: 30 (temperature≤40) + 10 (READY) = **40**。Node D は 15 (CLARIFYING) のみで 15。
- **next_action**: READY テンプレ（着手し、最初の一手を…）。

---

### サンプル 3: 候補がすべて DONE/COOLING のとき

**入力（要約）**

- 全ノードが status は DONE または COOLING のみ（※ dashboard は通常 DONE を返さないが、フィルタの意味で）

**期待**

- **suggested_next**: **null**。
- **debug** は存在しない。

---

（以上、Phase 3-4 スコアリング設計・サンプル期待値）
