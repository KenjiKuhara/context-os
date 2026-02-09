# 09_API_Contract.md
## API Contract for context-os（外部ワーキングメモリOS）

---

## 0. この文書の目的

本ドキュメントは、context-osにおける  
**APIの責務・粒度・入出力契約（Contract）** を定義する。

目的は以下の通り。

- Prompt Pack と API を 1対1 で対応させる
- AIが「できること／できないこと」を明確にする
- 実装の自由度を保ちつつ、意味的な破綻を防ぐ

本ドキュメントは以下を前提とする。

- 00_Vision_NorthStar.md
- 01_PRD.md
- 04_Domain_Model.md
- 05_State_Machine.md
- 06_Temperature_Spec.md
- 14_Prompt_Pack.md

---

## 1. API設計の基本原則

1. APIは「操作」ではなく「意図」を表す
2. Nodeは直接いじらず、必ずAPIを経由する
3. status / temperature の最終決定権は App 側にある
4. AIは「提案」まで、確定はサーバー
5. 1 API = 1 意味

---

## 2. API一覧（全体）

### Node操作系（中核）

- POST /nodes
- GET /nodes/{id}
- PATCH /nodes/{id}
- POST /nodes/{id}/children
- GET /nodes/{id}/context

### 状態・温度系

- POST /nodes/{id}/estimate-status
- POST /nodes/{id}/estimate-temperature

### ダッシュボード・再開系

- GET /dashboard/active
- GET /dashboard/cooling
- POST /resume/next

### 委任・判断系

- POST /nodes/{id}/delegate
- POST /nodes/{id}/decision-support

---

## 3. Node作成

### POST /nodes

**用途**
- Capture（思考の入口）
- 雑な入力のNode化

**Request**

```json
{
  "title": "string",
  "context": "string",
  "parent_id": "string | null"
}
````

**Server Responsibility**

* status を CAPTURED に設定
* temperature を初期値で付与
* history を開始

**Response**

```json
{
  "id": "node_id",
  "status": "CAPTURED",
  "temperature": 72
}
```

---

## 4. Node取得

### GET /nodes/{id}

**用途**

* 詳細表示
* 再開時の全体把握

**Response**

```json
{
  "id": "node_id",
  "title": "string",
  "context": "string",
  "status": "IN_PROGRESS",
  "temperature": 65,
  "parent_id": "string | null",
  "relations": [],
  "history": []
}
```

---

## 5. Node更新

### PATCH /nodes/{id}

**用途**

* context修正
* 人による微修正

**Request**

```json
{
  "title": "string (optional)",
  "context": "string (optional)"
}
```

**注意**

* status / temperature は直接変更不可
* 変更後に再推定APIを呼ぶことを想定

**非推奨：PATCH /nodes/{id}/status**

PoC 実装に `PATCH /nodes/{id}/status` が存在するが、  
これは **非推奨（deprecated）** である。

status 変更の唯一の正式ゲートは  
`POST /nodes/{id}/estimate-status` であり、  
以下を含む。

- State Machine に基づく遷移検証
- 必ず `node_status_history` に記録
- status unchanged でも event として残す

旧 API は MCP 等の外部参照がないことを確認のうえ廃止予定。  
新規の実装・ツール・エージェントから旧 API を呼ばないこと。

---

## 6. 分解（子Node作成）

### POST /nodes/{id}/children

**用途**

* Decomposition Prompt対応

**Request**

```json
{
  "children": [
    { "title": "string", "context": "string" }
  ]
}
```

**Server Responsibility**

* parent_id を自動設定
* sibling_order を付与
* 親Nodeは残す

---

## 7. 状態推定

### POST /nodes/{id}/estimate-status

> **詳細仕様**: `17_Skill_EstimateStatus.md`  
> Input / Output の完全な契約、副作用の保証、拡張枠、  
> 呼び出しパターン（人間 UI / AI エージェント / バッチ）は  
> Skill Contract ドキュメントを参照すること。

**用途**

* Status Estimation Prompt対応

**Request**

```json
{
  "reason": "string"
}
```

**Server Responsibility**

* 状態遷移ルールを検証
* 不正遷移は拒否または補正

**Response**

```json
{
  "status": "READY",
  "applied": true
}
```

**Preview / Apply の副作用ルール**

estimate-status は 2 つのモードを持つ。

1. **Preview**（`confirm_status` なし）  
   DB への副作用なし。推定候補の算出と返却のみ。  
   UI が「推定結果」を表示するために使用する。

2. **Apply**（`confirm_status` あり）  
   遷移検証 → status 更新（変更時のみ）→ **必ず history に 1 件記録**。

**重要：status unchanged でも history は記録する。**

「意味のある変化は必ず残す」がこのプロダクトの原則である。  
人が intent を入力して「メモだけ残す」を選択した場合、  
status は変わらなくても、そのintent/reason を  
`node_status_history` に `from_status === to_status` の形で記録する。

この設計により、  
「何が起きたか」の履歴が status 変更だけに限定されず、  
思考・判断・文脈の変化も追跡可能になる。

---

## 8. 温度推定

### POST /nodes/{id}/estimate-temperature

**用途**

* Temperature Estimation Prompt対応

**Request**

```json
{
  "signals": {
    "last_updated": "datetime",
    "mentions": 3,
    "external_events": 1
  }
}
```

**Response**

```json
{
  "temperature": 58,
  "trend": "down"
}
```

---

## 9. 再開ダッシュボード

**トレー分類の選定根拠**

MVP のダッシュボードは以下の 4 トレー ＋ その他で構成する。

| トレー | 対応する status | North Star §4 の観点 |
|--------|----------------|---------------------|
| 実施中 | IN_PROGRESS | 動いているもの |
| 判断待ち | NEEDS_DECISION | 止まっている理由 |
| 外部待ち | WAITING_EXTERNAL | 確認待ち |
| 冷却中 | COOLING | 冷えているが重要なもの |
| その他 | 上記以外のアクティブ状態 | — |

BLOCKED / DELEGATED / SCHEDULED 等に専用トレーを設けないのは、  
Non-Goals §4.1「リッチ UI を作らない」に従い、  
MVP では other_active に集約するため。

トレー数を増やす判断は、  
「そのトレーが再開判断を助けるか？」を基準とする。

### GET /dashboard/active

**用途**

* 「今なにやる？」の材料

**Response**

```json
{
  "nodes": [
    {
      "id": "node_id",
      "title": "string",
      "status": "IN_PROGRESS",
      "temperature": 81
    }
  ]
}
```

---

### GET /dashboard/cooling

**用途**

* 冷却確認対象の抽出

**Response**

```json
{
  "nodes": [
    {
      "id": "node_id",
      "temperature": 34,
      "status": "WAITING_EXTERNAL"
    }
  ]
}
```

---

## 10. 再開支援

### POST /resume/next

**用途**

* Resume Prompt対応

**Request**

```json
{
  "candidate_node_ids": ["id1", "id2"]
}
```

**Response**

```json
{
  "selected_node_id": "id1",
  "reason": "今やるべき理由",
  "next_action": "次の一手"
}
```

---

## 11. 委任

### POST /nodes/{id}/delegate

**用途**

* Delegation Prompt対応

**Request**

```json
{
  "assignee": "Human | AI",
  "note": "string"
}
```

**Response**

```json
{
  "status": "DELEGATED"
}
```

---

## 12. 判断支援

### POST /nodes/{id}/decision-support

**用途**

* Decision Support Prompt対応

**Response**

```json
{
  "options": [],
  "criteria": [],
  "next_decision": "string"
}
```

---

## 13. このAPI Contractの位置づけ

本ドキュメントは、

* Prompt Pack の実行先
* MCPツール定義の元
* 実装時の唯一のAPI正解

として機能する。

APIに迷った場合は、
**「この操作は思考の再開に必要か？」**
を判断基準とする。


