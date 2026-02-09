# 17_Skill_EstimateStatus.md
## Skill Contract：estimate-status

---

## 0. この文書の目的

本ドキュメントは、context-os における最初の **Skill Contract** として、  
`estimate-status` の入出力・副作用・拡張ルールを定義する。

Skill Contract とは、  
**人間 UI・AIエージェント・MCP ツール・サブエージェントの  
いずれから呼ばれても安全に動作することを保証する契約**である。

本ドキュメントは以下を前提とする。

- 00_Vision_NorthStar.md — 判断を奪わず、判断を支える
- 03_Non_Goals.md §2.2 — status を人に選ばせない
- 05_State_Machine.md — 全15状態・遷移ルール
- 09_API_Contract.md §7 — API 概要（本 doc で詳細化）
- 10_Architecture.md §3 — 状態の確定は App

---

## 1. Skill の概要

### 1.1 Skill 名

`estimate-status`

### 1.2 Endpoint

```
POST /api/nodes/{id}/estimate-status
```

### 1.3 役割

- Node の status 変更における**唯一のゲート**
- 遷移の妥当性を State Machine で検証する
- 変更の有無を問わず、意味のある変化を history に記録する

### 1.4 設計原則

| 原則 | 根拠 |
|------|------|
| AI は提案まで、確定は App | 10_Architecture.md §3.1 |
| 人は「違う」と指摘するだけ | 03_Non_Goals.md §2.2 |
| 不正遷移は拒否し代替案を返す | 05_State_Machine.md §3 |
| status unchanged でも履歴は残す | 09_API_Contract.md §7 |

---

## 2. モード

estimate-status は 2 つのモードを持つ。  
モード判定は `confirm_status` フィールドの有無で行う。

### 2.1 Preview mode

```
confirm_status が absent → Preview
```

- DB への副作用：**なし（保証）**
- intent から status 候補を推定し、遷移可能な全候補とともに返す
- 呼び出し側が結果を見て判断する（人間 UI）、  
  または次の Apply を構成する材料にする（エージェント）

### 2.2 Apply mode

```
confirm_status が present → Apply
```

- 遷移ルールを State Machine で検証
- status 更新（変更がある場合のみ）
- **history に必ず 1 件記録**（status unchanged でも）

---

## 3. Input Contract（固定）

### 3.1 Path Parameter

| パラメータ | 型 | 必須 | 説明 |
|-----------|------|------|------|
| `id` | string | Yes | 対象 Node の ID |

### 3.2 Request Body

| フィールド | 型 | 必須 | 説明 |
|-----------|------|------|------|
| `intent` | string | No | **推定の材料**。自然言語テキスト。AI/エージェントが「なぜこの status だと思うか」を伝えるための入力。Preview mode で推定ロジック（キーワードマッチ or LLM）の入力になる。Apply mode では reason のフォールバックとしても使われる。 |
| `confirm_status` | string | No | 指定時は **Apply mode** に入る。省略時は **Preview mode**。値は State Machine で定義された 15 状態のいずれか。 |
| `reason` | string | No | **確定の理由**。Apply mode で history に記録される説明文。intent とは別の軸であり、「なぜこの確定が妥当か」を説明する。省略時は intent をフォールバックとする。 |

### 3.3 intent と reason の区別（重要）

| | intent | reason |
|---|--------|--------|
| **役割** | 推定の材料 | 確定の理由 |
| **誰が書くか** | 人間の入力 / AI の観測 | 人間の判断 / AI の説明 |
| **使われる場面** | Preview mode の推定ロジックへの入力 | Apply mode の history 記録 |
| **例（人間）** | 「返信待ちになった」 | 「クライアントからの回答を待つため」 |
| **例（エージェント）** | 「最終更新から 7 日経過、外部イベントなし」 | 「温度低下により COOLING を提案」 |

Apply 時の history に記録される文字列の優先順位：

```
reason > intent > デフォルトメッセージ
```

この区別により、  
「何をもとに推定したか」（intent）と  
「なぜ確定したか」（reason）が混同されず、  
将来のトレーサビリティが担保される。

---

## 4. Output Contract（固定）

### 4.1 Preview mode のレスポンス

```json
{
  "ok": true,
  "applied": false,
  "current_status": "IN_PROGRESS",
  "current_label": "実施中",
  "suggested": {
    "status": "WAITING_EXTERNAL",
    "label": "外部待ち",
    "reason": "「返信待ち」の内容から推定しました"
  },
  "candidates": [
    { "status": "DONE", "label": "完了" },
    { "status": "WAITING_EXTERNAL", "label": "外部待ち" }
  ]
}
```

- `suggested` は推定不能なら `null`
- `candidates` は State Machine の遷移ルールに基づく全候補

### 4.2 Apply mode のレスポンス（成功）

```json
{
  "ok": true,
  "applied": true,
  "from_status": "IN_PROGRESS",
  "to_status": "WAITING_EXTERNAL",
  "status_changed": true,
  "reason": "クライアントからの回答を待つため"
}
```

- `status_changed` が `false` の場合、status は変わっていないが history には記録されている

### 4.3 Apply mode のレスポンス（遷移拒否）

```json
{
  "ok": false,
  "error": "transition from CAPTURED to DONE is not allowed",
  "valid_transitions": [
    { "status": "CLARIFYING", "label": "言語化中" },
    { "status": "READY", "label": "着手可能" }
  ]
}
```

HTTP status: **422**

- エージェントはこの `valid_transitions` を使ってリトライできる

### 4.4 共通エラーレスポンス

| HTTP status | 条件 |
|-------------|------|
| 400 | 不正な JSON / 不正な status 文字列 |
| 404 | Node が存在しない |
| 422 | 遷移が State Machine で許可されていない |
| 500 | サーバー内部エラー |

すべてのエラーは `{ "ok": false, "error": "..." }` 形式で返る。

---

## 5. 副作用の保証（固定）

| 条件 | nodes テーブル | node_status_history |
|------|---------------|---------------------|
| Preview mode | **書き込みなし** | **書き込みなし** |
| Apply + status_changed=true | status を UPDATE | **必ず INSERT** |
| Apply + status_changed=false | **書き込みなし** | **必ず INSERT** |

この副作用ルールは Skill の**契約**であり、変更してはならない。

---

## 6. 拡張枠（将来追加してよいフィールド）

以下は将来の拡張として**予約されたスロット**である。  
既存フィールドの意味や型を壊さず、optional フィールドとして追加する。

### 6.1 Input 拡張枠

| フィールド | 型 | 目的 | 状態 |
|-----------|------|------|------|
| `source` | string? | 呼び出し元の識別。`"human_ui"` / `"ai_agent"` / `"mcp"` / `"batch"` / `"skill_chain"`。history に記録し、監査・トレースに使用する。 | **Phase 2-α で実装済み（optional）** |
| `confirmation` | object? | 人間承認の証跡。23_Human_Confirmation_Model.md §2.1 の Confirmation Object。Apply 時に history に保存される。 | **Phase 2-α で実装済み（optional）** |

**Phase 2-α の実装仕様**：

- `source` / `confirmation` はともに **optional**。省略時は `human_ui` と見なす（後方互換）
- Apply 時に `source` / `confirmation` の全フィールドが `node_status_history` に記録される
- `source` が `"batch"` または `"skill_chain"` の場合、Apply は **403 Forbidden** で拒否する（18_Skill_Governance §3.3）
- `confirmation` の構造：
  ```json
  {
    "confirmation_id": "UUID",
    "confirmed_by": "human",
    "confirmed_at": "ISO 8601",
    "ui_action": "dashboard_apply_button",
    "proposed_change": { "type": "status_change", "from": "IN_PROGRESS", "to": "DONE" }
  }
  ```
- Phase 2-β で `source` を required に移行予定

### 6.2 Output 拡張枠

| フィールド | 型 | 目的 | 追加時期の目安 |
|-----------|------|------|--------------|
| `node_id` | string | レスポンスに Node ID を含める。バッチ処理・並行処理でレスポンスと Node を紐づけやすくする。 | 複数 Node 並行操作が必要になったとき |
| `estimation_method` | string | 推定手法の識別。`"keyword"` / `"llm"` / `"rule"`。推定精度の評価・デバッグに使用。 | LLM 推定導入時 |

### 6.3 拡張ルール

- 既存フィールドの**型・意味・必須/任意の区分**を変えてはならない
- 拡張フィールドは常に **optional** として追加する
- 既存の呼び出し側が拡張フィールドを送らなくても動作が変わらないこと
- 拡張フィールドが出力に追加されても、既存の呼び出し側が壊れないこと

---

## 7. 推定ロジックの差し替えルール

### 7.1 現在の実装

`src/lib/stateMachine.ts` の `estimateStatusFromIntent` 関数。  
キーワードマッチによるルールベース推定（MVP）。

### 7.2 差し替え可能な条件

推定ロジックは以下の条件を満たせば差し替えてよい。

1. **API の Input / Output Contract が変わらない**こと
2. **遷移検証は推定ロジックの外**で行うこと（App Server の責務）
3. **推定不能の場合は `suggested: null` を返す**こと（フォールバック）
4. **副作用を持たない**こと（推定はあくまで計算）

### 7.3 想定される差し替えパス

```
MVP:  キーワードマッチ（同期・純粋関数）
  ↓
Phase 2:  LLM 推定（async・外部 API 呼び出し）
          ルールベースはフォールバックとして残す
  ↓
Phase 3:  Node の全 context + history を考慮した推定
          14_Prompt_Pack.md §3 の Status Estimation Prompt 準拠
```

いずれのフェーズでも、この Skill Contract の Input / Output は不変。

**境界ルール**：推定ロジックを Python に切り出す場合の制約は  
`25_Boundary_NextJS_PythonAgent.md` を参照すること。  
遷移検証・DB 確定・history 記録は常に Next.js 側に残る。

---

## 8. 呼び出しパターン（参考）

### 8.1 人間 UI（ダッシュボード）

```
1. intent 入力 → Preview → 候補表示
2. 人が確認 → Apply（confirm_status + reason）
3. 「メモだけ残す」→ Apply（confirm_status = current_status）
```

### 8.2 AI エージェント（MCP 経由）

```
1. Node の context + temperature を分析
2. Preview で候補を取得（スキップ可）
3. 人間に提案として返し、承認を得る
4. Apply（confirm_status + intent + reason + source + confirmation）
5. 422 が返った場合、valid_transitions から再選択してリトライ
```

※ 18_Skill_Governance.md §3 により、  
AI エージェントが Apply を呼ぶには人間の確認証跡（confirmation）が必要。

### 8.3 定期バッチ（将来）

```
1. 対象 Node を抽出
2. Preview で各 Node の推定を取得
3. 推定結果を人に通知（Apply はしない）
4. 人が確認後に Apply
```

---

## 9. この Skill Contract の位置づけ

本ドキュメントは、

- estimate-status API の**唯一の詳細仕様**
- MCP ツール定義の元
- サブエージェント・Skills の契約テンプレート

として機能する。

09_API_Contract.md §7 は本 Skill の概要を示し、  
詳細な契約は本ドキュメントに委ねる。

Skill Contract に迷った場合は、  
**「呼び出し元が変わっても同じ結果になるか？」**  
を判断基準とする。

---

## 10. 呼び出し制限（Apply ガード）

本セクションは `18_Skill_Governance.md` の共通ルールを前提とし、  
estimate-status **固有の制約**を定義する。

### 10.1 共通ルールの適用

以下は 18_Skill_Governance.md で定義された共通ルールであり、  
estimate-status にもそのまま適用される。

- Preview は無制限（§2.1）
- Apply は人間確認必須（§2.2）
- source + confirmation の二層ガード（§3）
- Skill 間の Apply 連鎖は禁止（§4.2）

### 10.2 estimate-status 固有の制約

#### (1) 遷移拒否時の再提案義務

estimate-status が Apply を 422（遷移拒否）で返した場合、  
呼び出し元（エージェント含む）は  
**valid_transitions を人間に再提示し、再確認を得なければならない**。

エージェントが valid_transitions から自動でリトライし、  
人間の確認なしに別の status で Apply を再送することは禁止する。

理由：  
422 は「提案された遷移が不正だった」ことを意味する。  
不正な提案の後に AI が自動で別の候補を試すのは  
「判断を AI が行っている」ことに等しく、  
00_Vision §5.4 に反する。

#### (2) status unchanged Apply の扱い

`confirm_status = current_status`（メモだけ残す）の Apply は、  
status を変更しないが history に event を記録する。

この操作は status 確定ではないため、  
**source / confirmation の制約を緩和する**。

| source | confirmation | Apply（status unchanged）許可 |
|--------|-------------|------------------------------|
| `human_ui` | 不要 | **許可** |
| `ai_agent` | 不要 | **許可** |
| `mcp` | 不要 | **許可** |
| `batch` | 不要 | **許可** |
| `skill_chain` | 不要 | **許可** |

理由：  
status unchanged の Apply は「観測の記録」であり、  
状態を変える行為ではない。  
エージェントやバッチが「この Node を観測した」という  
event を残すことは、context-os の価値（冷却検知・再燃トリガー）に  
とって有益であり、人間の判断を奪わない。

#### (3) DONE / CANCELLED への遷移は常に人間確認必須

終了状態（DONE / CANCELLED）への Apply は、  
source に関わらず **confirmation.confirmed_by === "human"** を必須とする。

理由：  
「やらないと決めた」「完了した」は不可逆性の高い判断であり、  
00_Vision §7「思考の主導権が常に人間側にある」を  
特に厳格に守る必要がある。

### 10.3 MVP での扱い

- source / confirmation はともに optional（17 §6.1 の拡張枠）
- 省略時は human_ui と見なす（後方互換）
- 上記 (1)(2)(3) の制約は、  
  source フィールド実装後に Skill 内のバリデーションとして追加する
- MVP では **docs 上の設計決定のみ** であり、コードによる強制はしない
