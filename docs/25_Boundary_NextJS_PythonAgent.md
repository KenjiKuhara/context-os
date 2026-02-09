# 25_Boundary_NextJS_PythonAgent.md
## 境界線定義：Next.js（Skill 層）と Python Agent 層

---

## 0. この文書の目的

本ドキュメントは、context-os における  
**Next.js（App Server / Skill 層）と Python Agent 層の責務境界**  
を定義する Single Source of Truth である。

context-os は Vercel + Supabase（Next.js API Routes）を基盤とし、  
将来 Python（LangChain 等）でエージェントを実装する。  
このとき「どこまでが Next.js の責務で、どこからが Python の責務か」  
を曖昧にすると、ビジネスルールの二重実装や安全装置のバイパスが起きる。

本ドキュメントは以下を前提とする。

- 10_Architecture.md §2-3 — 5 層アーキテクチャと責務分離
- 17_Skill_EstimateStatus.md — Skill Contract（estimate-status）
- 18_Skill_Governance.md §3 — source + confirmation の二層ガード
- 23_Human_Confirmation_Model.md — Confirmation Object SSOT
- 24_SubAgent_Executor.md — Level 3 の Confirmation 消費フロー

---

## 1. 一文定義

> **Python は proposal を送り、Next.js が validate → commit する。**

```
Python Agent ──→ 「こうだと思う」（intent / proposed_status / reason）
                      │
                      ▼  HTTP / MCP
              ┌───────────────────┐
              │  Next.js Skill    │
              │  ・遷移検証       │ ← ここが境界
              │  ・Confirmation検証│
              │  ・DB確定         │
              │  ・history記録    │
              └───────────────────┘
```

| 責務 | 担当 | 一言 |
|------|------|------|
| **考える** | Python Agent | 推定・提案・整理・案出し |
| **検証する** | Next.js Skill | State Machine 遷移・Confirmation 有効性 |
| **確定する** | Next.js Skill | nodes.status UPDATE・confirmation_events consumed |
| **記録する** | Next.js Skill | node_status_history INSERT |
| **拒否する** | Next.js Skill | 不正遷移（422）・未承認（403）・再利用（409） |

---

## 2. Next.js に残さなければならないもの

以下は **Vercel + Next.js API Routes に留める。Python に切り出してはならない。**

| 責務 | 具体的な処理 | 根拠 |
|------|------------|------|
| State Machine の遷移検証 | `isValidTransition()` | 10 §2.4「不正な遷移を防ぐ」 |
| status / temperature の確定 | `nodes` テーブルの UPDATE | 10 §3.1「状態の確定 = App」 |
| Confirmation の検証 | `confirmation_events` の SELECT + 6 段階検証 | 23 §4.2 |
| Confirmation の消費 | `confirmation_events` の UPDATE (consumed=true) | 23 §3.3 / 24 §6 |
| history への INSERT | `node_status_history` への書き込み | 10 §2.4「監査ログの保持」 |
| source × confirmation の許可判定 | batch/skill_chain の拒否、ai_agent/mcp の confirmation 必須 | 18 §3.3 |
| API エンドポイント定義 | Skill Contract の実体（17 §1.2） | 17 全体 |

**まとめ**：「検証する」「確定する」「記録する」「拒否する」は Next.js。

---

## 3. Python Agent に切り出せるもの

以下は **将来 Python プロセスとして独立させてよい。Next.js とは HTTP / MCP で通信する。**

| 責務 | 具体的な処理 | 根拠 |
|------|------------|------|
| intent からの status 推定 | LLM ベースの estimateStatusFromIntent | 10 §3.1「状態の提案 = AI」、17 §7 |
| Observer（Level 0） | dashboard 読み取り + Preview + ObserverReport 構成 | 19 §3 |
| Organizer（Level 1） | Node 群の分析 + OrganizerReport 構成 | 21 §3 |
| Advisor（Level 2） | 選択肢生成 + AdvisorReport 構成 | 22 §3 |
| Executor（Level 3）のオーケストレーション | Confirmation を持って Apply を呼ぶ | 24 §8 |
| Prompt Pack の実行 | Capture / Status Estimation / Resume 等 | 10 §2.2、14 全体 |

**まとめ**：「考える」「推定する」「提案する」「整理する」は Python に出せる。

---

## 4. 禁止事項

### 4.1 Python 側で禁止

| 禁止事項 | 根拠 |
|---------|------|
| DB への直接 INSERT / UPDATE / DELETE | 10 §2.2「DB を直接触らない」 |
| `nodes.status` の直接変更 | 10 §3.1「確定は App」 |
| `confirmation_events` の直接操作 | 23 §4（App の責務）、RLS で DB レベル禁止 |
| `node_status_history` への直接書き込み | 10 §2.4「監査ログは App」 |
| 遷移検証のスキップ（estimate-status を経由しない status 変更） | 17 §1.3 / 18 §2.2 |
| Apply の自動リトライ（422 後に別候補で再送） | 17 §10.2 (1)、24 §6.3 |
| Confirmation なしでの Apply 呼び出し（source が ai_agent / mcp の場合） | 18 §3.3 / 23 §8.4 |

### 4.2 Next.js 側で禁止

| 禁止事項 | 根拠 |
|---------|------|
| intent の推定ロジックに LLM を直接組み込む | 推定は Agent 層の責務。App は検証のみ |
| ObserverReport / OrganizerReport / AdvisorReport の構成 | App は Skill を提供する側。提案を構成する側ではない |
| Prompt Pack の実行 | App は prompt を実行しない。10 §2.4 に prompt 関連の責務はない |

---

## 5. 通信方式と想定 payload

### 5.1 通信方式

| 方式 | 用途 | 方向 |
|------|------|------|
| **HTTP（REST）** | Python Agent → Next.js Skill API を直接呼び出す | Agent → App |
| **MCP（将来）** | LLM → MCP Server → Next.js Skill API | LLM → MCP → App |

Python Agent は Next.js の Skill API を **HTTP クライアントとして呼び出す**。  
DB には一切アクセスしない。

### 5.2 想定 payload：estimate-status Preview

Python Agent が Node の状態を推定するとき：

```
Agent → POST /api/nodes/{id}/estimate-status
```

```json
{
  "intent": "最終更新から 7 日経過、外部イベントなし"
}
```

応答（Preview）：

```json
{
  "ok": true,
  "applied": false,
  "current_status": "IN_PROGRESS",
  "suggested": { "status": "COOLING", "label": "冷却中", "reason": "..." },
  "candidates": [...]
}
```

Agent はこの結果を ObserverReport / AdvisorReport の材料にする。  
**DB への副作用なし。何度呼んでもよい。**

### 5.3 想定 payload：estimate-status Apply（Executor 経由）

人間が承認した後、Level 3 Executor（Python）が Apply を代行するとき：

```
Agent → POST /api/nodes/{id}/estimate-status
```

```json
{
  "intent": "温度低下により COOLING を提案",
  "confirm_status": "COOLING",
  "reason": "Observer が検知し、人間が承認した",
  "source": "ai_agent",
  "confirmation": {
    "confirmation_id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

応答（Apply 成功）：

```json
{
  "ok": true,
  "applied": true,
  "from_status": "IN_PROGRESS",
  "to_status": "COOLING",
  "status_changed": true,
  "source": "ai_agent",
  "confirmation_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**confirmation_id は事前に POST /api/confirmations で人間承認として発行済みであること。**

### 5.4 想定 payload：confirmation 発行

Python Agent は confirmation を**発行しない**。  
confirmation は人間の UI 操作またはチャット承認で生成される。

```
人間 UI → POST /api/confirmations
```

```json
{
  "node_id": "...",
  "ui_action": "dashboard_apply_button",
  "proposed_change": { "type": "status_change", "from": "IN_PROGRESS", "to": "COOLING" }
}
```

Agent は発行済みの `confirmation_id` を受け取り、Apply に添付するだけ。

---

## 6. LangChain 等の位置づけ

### 6.1 LangChain / LangGraph は「提案生成器」である

LangChain / LangGraph を導入する場合、それは  
**Observer / Organizer / Advisor の内部実装**として使用する。

| context-os の概念 | LangChain での実装 |
|------------------|------------------|
| Observer（Level 0） | LangChain の Chain / Agent が dashboard API を叩き、ObserverReport を構成 |
| Organizer（Level 1） | LangChain の Chain が Node 群を分析し、OrganizerReport を構成 |
| Advisor（Level 2） | LangChain の Chain が選択肢を生成し、AdvisorReport を構成 |
| Executor（Level 3） | LangChain の Agent が confirmation_id を持って Apply を呼ぶ |
| estimateStatusFromIntent | LLM Chain が intent からステータスを推定（17 §7.3 Phase 2） |

### 6.2 LangChain が触れないもの

| 触れないもの | 理由 |
|------------|------|
| DB（Supabase） | §4.1 の禁止事項。RLS で DB レベル遮断 |
| State Machine の遷移ルール | Next.js 内の `stateMachine.ts` が SSOT |
| Confirmation の検証・消費 | Next.js 内の estimate-status route が実行 |
| history の書き込み | Next.js 内の estimate-status route が実行 |

### 6.3 LangGraph は「フロー制御」に使ってよい

LangGraph の状態グラフを使って  
「Observer → Organizer → Advisor → 人間に提案」の  
フロー制御を行うことは**許可する**。

ただし、グラフ内のノードが Apply を直接呼ぶ場合は  
**必ず Confirmation を添付する**（Executor パターン）。  
グラフの途中で Apply を連鎖呼び出しすることは  
18 §4.2（Apply 連鎖禁止）に該当するため禁止。

---

## 7. 境界違反の検出方法

### 7.1 runtime で検出

| 違反 | 検出方法 |
|------|---------|
| Agent が confirmation なしで Apply | estimate-status が 403 を返す |
| Agent が batch / skill_chain として Apply | estimate-status が 403 を返す |
| Agent が consumed 済み confirmation を再利用 | estimate-status が 409 を返す |
| クライアントが confirmation_events を直接操作 | RLS が拒否 |

### 7.2 コードレビューで検出

| 違反 | 検出方法 |
|------|---------|
| Python コードに `supabaseAdmin` / DB 接続コードがある | レビューで拒否 |
| Python コードに遷移検証ロジック（isValidTransition 等）がある | レビューで拒否（二重実装） |
| Next.js コードに LLM 呼び出し / Prompt 実行がある | レビューで拒否（責務違反） |

---

## 8. 既存 doc との参照関係

| doc | 本 doc との関係 |
|-----|---------------|
| **10_Architecture.md §2-3** | 5 層アーキテクチャの責務分離が本 doc の根拠。App Server = Next.js、LLM = Python |
| **17_Skill_EstimateStatus.md §7** | 推定ロジックの差し替えパス。本 doc が Python 側の制約を定義 |
| **18_Skill_Governance.md §3** | source + confirmation のガード。本 doc が「誰が Apply してよいか」を技術レイヤーで具体化 |
| **23_Human_Confirmation_Model.md** | Confirmation SSOT。本 doc が「confirmation は Next.js が検証、Python は添付するだけ」を定義 |
| **24_SubAgent_Executor.md** | Level 3 の Apply 代行。本 doc が「Executor は Python で動くが、Apply 先は必ず Next.js」を定義 |

---

## 9. この文書の位置づけ

本ドキュメントは、

- Next.js / Python の**責務境界の唯一の定義**
- Python Agent 開発時の**ガードレール**
- LangChain / LangGraph 導入時の**制約書**
- コードレビュー時の**境界違反チェックリスト**

として機能する。

境界に迷った場合は、  
**「この処理は、validate / commit / record のいずれかか？」**  
を判断基準とする。  
Yes なら Next.js。No なら Python に出してよい。
