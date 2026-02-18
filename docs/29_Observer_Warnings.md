# 29_Observer_Warnings.md
## ObserverReport の warnings 仕様（Phase 3-4.4）

---

## 0. 目的

- **summary** と **node_count** / **status 集計**のズレを「事故る前に必ず検知」する。
- 人が見て違和感を感じる前に、Observer が **warnings** で自己申告する設計にする。

---

## 1. node_count の SSOT（Single Source of Truth）

- **node_count** は **dashboard から取得した Node 数**（`len(all_nodes)`）のみを入れる。
- **summary** 内の「◯件のノードがあります」という表現は、**必ず node_count から生成**する。
- 独立したカウント処理は禁止（数え直さない）。

---

## 2. warnings の形式

**payload.warnings** は次の形のオブジェクトの配列とする。

```ts
warnings: Array<{
  code: string;
  message: string;
  details?: Record<string, unknown>;
}>
```

- **code**: 警告種別（例: `COUNT_MISMATCH`, `SUMMARY_MISMATCH`）
- **message**: 人間向け短い説明
- **details**: 任意。デバッグ用の数値・内訳

---

## 3. COUNT_MISMATCH の発生条件

**status 別集計**（IN_PROGRESS / WAITING_EXTERNAL / CLARIFYING など）を **all_nodes** から集計し、その合計（**status_sum**）と **node_count** が一致しない場合に **COUNT_MISMATCH** を 1 件追加する。

- **node_count** = `len(all_nodes)`（SSOT）
- **by_status** = 各 node の `status` でグルーピングした件数
- **status_sum** = `sum(by_status.values())`

正常時は常に `status_sum === node_count` のため、COUNT_MISMATCH は発生しない。  
発生するのは **node_count を別の式で誤って設定した場合** や **実装バグ** がある場合。

**COUNT_MISMATCH の details 例**

```json
{
  "code": "COUNT_MISMATCH",
  "message": "node_count と status 集計の合計が一致しません",
  "details": {
    "node_count": 3,
    "status_sum": 5,
    "by_status": {
      "IN_PROGRESS": 2,
      "WAITING_EXTERNAL": 1,
      "READY": 2
    }
  }
}
```

---

## 4. SUMMARY_MISMATCH（summary と node_count の不一致）

summary の先頭「机の上に N 件のノードがあります」から N を抽出し、**node_count** と異なる場合に **SUMMARY_MISMATCH** を 1 件追加する。  
正しく summary を node_count から生成していれば通常は発生しない。

---

## 5. warnings が 1 件以上ある場合の挙動

- **suggested_next の算出は止めない**（提案はそのまま返す）。
- **Preview-only / Apply なし** の安全設計は維持する。
- warnings は「異常の早期発見」用であり、処理の中断や API の失敗にはしない。

---

## 6. ダッシュボード表示時の扱い

- **payload.warnings** に 1 件以上ある場合、ダッシュボードでは **⚠ 表示** される想定とする。
- 例: 「Observer の提案」パネルに、warnings の code / message を一覧表示する。

---

## 7. COUNT_MISMATCH が出るサンプルケース

**想定**: node_count を誤って「固定値や別の式」で設定している実装バグがある場合。

- **例**: node_count を誤って **3** に固定した実装で、dashboard が **5** 件の Node を返した場合。
  - all_nodes は 5 件。
  - status 別集計（by_status）の合計 **status_sum = 5**。
  - 一方 node_count が 3 のため、**status_sum (5) !== node_count (3)** となり、**COUNT_MISMATCH** が 1 件追加される。
  - details には `node_count: 3`, `status_sum: 5`, `by_status: { ... }` が入る。

正しい実装では **node_count = len(all_nodes)** のみを使うため、このケースは発生しない。テストや検証時には、意図的に node_count を別値にしたレポートを組み、warnings 表示やアラートの確認に使える。

---

（以上、Phase 3-4.4 ObserverReport warnings 仕様）
