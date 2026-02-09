# 24_SubAgent_Executor.md
## SubAgent 設計：Executor（承認消費・Apply 代行エージェント）

---

## 0. この文書の目的

本ドキュメントは、context-os における Level 3 サブエージェントの  
代表例である **Executor** の役割・制約・Skill 利用ルールを定義する。

Executor は **「実行するが、判断しない」** エージェントである。

Level 0〜2 は「考えるが、決めない」エージェントであり、  
Apply を一切呼べない。  
Executor は**唯一 Apply を呼べる**が、  
それは**人間の承認（Confirmation Object）を消費する場合に限られる**。

Executor は自ら何かを提案することも、選択することも、推定することもしない。  
人間が承認した内容を、**そのまま**Skill に渡し、**結果を報告する**だけである。

本ドキュメントは以下を前提とする。

- 00_Vision_NorthStar.md §5.4 — 思考の主導権が常に人間側にある
- 10_Architecture.md §3.2 — AI に考えさせるが、決めさせない
- 17_Skill_EstimateStatus.md §10 — estimate-status 固有の Apply ガード
- 18_Skill_Governance.md §3 — source + confirmation の二層ガード
- 20_SubAgent_Catalog.md §6 — Level 3 の定義と制約
- 23_Human_Confirmation_Model.md — Confirmation Object の SSOT

---

## 1. Executor とは何か

### 1.1 一言での定義

Executor は、  
**人間が承認した Confirmation Object を消費し、  
対応する Skill の Apply を 1 回だけ実行して結果を報告する**  
サブエージェントである。

### 1.2 Executor がやること

- Confirmation Object の有効性を検証する
- 検証に通った場合、対応する Skill の Apply を 1 回実行する
- Confirmation を「消費済み」に更新する
- 実行結果（成功・失敗・拒否）を人間に報告する

### 1.3 Executor が絶対にやらないこと

- **判断しない** — status の選択・推定・変更先の決定を一切行わない
- **提案しない** — 「代わりにこの status はどうですか」と返さない
- **リトライしない** — Apply が 422 で拒否された場合、別の候補で再試行しない
- **改変しない** — 人間が承認した内容を書き換えて Apply しない
- **連鎖しない** — 1 つの承認で複数の Apply を実行しない
- **Preview を使って新たな判断をしない** — Preview は承認検証のための事実確認にのみ使用

### 1.4 Level 0〜2 との決定的な違い

| 観点 | Level 0〜2 | Executor (Level 3) |
|------|-----------|-------------------|
| Apply | **禁止** | **条件付き許可** |
| 出力の性質 | 提案（proposals） | 事実と結果（results） |
| 思考 | する（観測/整理/案出し） | **しない** |
| Confirmation | 不要（Apply しないため） | **必須** |
| 責任範囲 | 提案の質 | 実行の正確さ |

**要約**：  
Level 0〜2 は「頭脳」。Executor は「手」。  
頭脳が考え、人間が決め、手が動かす。

---

## 2. 18 / 20 / 23 との整合

### 2.1 18_Skill_Governance.md との対応

| ガバナンスルール | Executor の振る舞い |
|----------------|-------------------|
| §2.1 Preview は無制限 | Executor は承認検証のために Preview を呼べる（事実確認のみ） |
| §2.2 Apply は人間確認必須 | **Confirmation Object の検証を経た場合にのみ Apply を呼ぶ** |
| §3.1 source | `source: "ai_agent"` を Apply リクエストに付与する |
| §3.2 confirmation | Confirmation Object 全体を Apply リクエストに添付する |
| §3.3 マトリクス | `ai_agent` + `confirmed_by: "human"` → 条件付き許可 |
| §4.2 Apply 連鎖は禁止 | **1 承認 1 Apply。連鎖しない** |

### 2.2 20_SubAgent_Catalog.md §6 との対応

| 20 §6 の制約 | Executor の実装 |
|-------------|---------------|
| 制約 1：判断しない | Executor は承認内容をそのまま渡すだけ。改変しない（§1.3） |
| 制約 2：1 承認 1 Apply | Confirmation Object の `consumed` フラグで担保（§5） |
| 制約 3：結果を必ず人間に返す | ExecutorResult を必ず生成し返却する（§4） |

### 2.3 23_Human_Confirmation_Model.md との対応

| 23 の要素 | Executor での扱い |
|----------|-----------------|
| §2 Confirmation Object | Executor の入力。§5 で全フィールドを検証する |
| §3 ライフサイクル | Executor は「承認→消費済み」の遷移を実行する |
| §4 1 承認 1 Apply | Executor の §5 検証フローが 23 §4.2 の 6 段階検証を実装する |
| §3.3 消費の条件 | Apply **成功時のみ**消費する。失敗時は消費しない（§6） |
| §3.4 失効条件 | Executor は失効済み承認を検出し、拒否する（§5 ステップ 3） |

---

## 3. 呼び出してよい Skill

### 3.1 許可される Skill 呼び出し

| Skill | モード | 用途 | 条件 |
|-------|--------|------|------|
| `estimate-status` | **Apply** | 承認された status 変更を実行する | **Confirmation Object 検証済みの場合のみ** |
| `estimate-status` | Preview | 承認検証時に Node の現在 status を確認する | 無条件（事実確認） |
| `GET /nodes/{id}` | 読み取り（将来） | 承認検証時に Node の現在状態を確認する | 無条件（事実確認） |

### 3.2 禁止される Skill 呼び出し

| 操作 | 禁止理由 |
|------|---------|
| `estimate-status` Apply（**Confirmation なし**） | 18 §2.2 違反。人間承認なしの Apply |
| `POST /nodes` | Executor は Node 作成の責務を持たない |
| `PATCH /nodes/{id}` | Executor は Node 更新の責務を持たない |
| `POST /nodes/{id}/children` | 構造変更は Executor のスコープ外 |
| DB への直接クエリ | 10_Architecture §2.2 |

### 3.3 Preview の使用制限

Executor は Preview を呼べるが、その**用途は事実確認のみ**に限る。

| 許可される Preview の使い方 | 禁止される Preview の使い方 |
|--------------------------|--------------------------|
| Node の現在 status が承認時の `from` と一致するか確認 | Preview の推定結果をもとに別の status を提案する |
| 遷移が有効かどうかを事前に確認 | 推定候補から「より良い」遷移先を選択する |

Preview を「考える」ために使った時点で、  
Executor は Level 0〜2 の領域を侵犯している。

---

## 4. 入力と出力

### 4.1 入力：ExecutorRequest

Executor への入力は以下の構造を持つ。

```
ExecutorRequest {
  confirmation_id: string     // 消費する Confirmation Object の ID
  
  // Apply に渡す内容（Confirmation の proposed_change と一致する必要がある）
  apply_request: {
    node_id: string           // 対象 Node ID
    confirm_status: string    // 確定する status
    intent: string            // 推定の材料（元の提案時の intent）
    reason: string            // 確定の理由（元の承認時の reason）
  }
}
```

**重要**：  
`apply_request` の内容は、Confirmation Object の `proposed_change` と  
**完全に一致しなければならない**。  
Executor が `apply_request` の内容を改変・追加・省略することは禁止。

### 4.2 ExecutorRequest と Skill API の関係

Executor は ExecutorRequest を受け取り、  
以下の estimate-status Apply リクエストに変換する。

```json
{
  "intent": "(ExecutorRequest.apply_request.intent)",
  "confirm_status": "(ExecutorRequest.apply_request.confirm_status)",
  "reason": "(ExecutorRequest.apply_request.reason)",
  "source": "ai_agent",
  "confirmation": {
    "confirmation_id": "(ExecutorRequest.confirmation_id)",
    "confirmed_by": "human",
    "confirmed_at": "(Confirmation Object から取得)",
    "ui_action": "(Confirmation Object から取得)"
  }
}
```

Executor が追加するのは `source: "ai_agent"` のみ。  
他のフィールドはすべて入力または Confirmation Object に由来する。

### 4.3 出力：ExecutorResult

Executor の出力は **ExecutorResult** 型で統一する。  
出力に「提案」「候補」「推定」は含まない。**事実と結果のみ**。

```
ExecutorResult {
  // === 結果の種別 ===
  outcome: "applied" | "rejected" | "reconfirm_required" | "error"
  
  // === 対象 ===
  node_id: string
  confirmation_id: string
  
  // === outcome = "applied" の場合 ===
  applied: {
    from_status: string
    to_status: string
    status_changed: boolean
    reason: string
    consumed_at: string       // Confirmation が消費された日時
  } | null
  
  // === outcome = "rejected" の場合 ===
  rejection: {
    phase: string             // どの検証ステップで拒否されたか
    reason: string            // 拒否理由（事実ベース）
  } | null
  
  // === outcome = "reconfirm_required" の場合 ===
  reconfirm: {
    reason: string            // なぜ再承認が必要か
    current_status: string    // Node の現在の status
    valid_transitions: [      // 遷移可能な候補（17 §10.2 (1) 対応）
      { status: string, label: string }
    ]
  } | null
  
  // === outcome = "error" の場合 ===
  error: {
    message: string
  } | null
}
```

### 4.4 出力に「含まないもの」

| 含まないもの | 理由 |
|------------|------|
| suggested_status | Executor は推定しない |
| options / candidates | Executor は選択肢を出さない |
| pros / cons | Executor は評価しない |
| next_action | Executor は次の一手を提案しない |
| summary | Executor は要約しない |

ExecutorResult は**機械的なレポート**であり、  
人間が読んで「次に何をするか」を自分で判断する材料に留まる。

---

## 5. 承認検証フロー（1 承認 1 Apply の担保）

23_Human_Confirmation_Model.md §4.2 の 6 段階検証を  
Executor の手順として具体化する。

### 5.1 フロー全体

```
Step 1: Confirmation Object の存在確認
   confirmation_id で検索 → 見つからない → rejected（phase: "not_found"）

Step 2: 消費済みチェック
   consumed === true → rejected（phase: "already_consumed"）

Step 3: 失効チェック
   a. confirmed_at から 24 時間以上経過 → rejected（phase: "expired_time"）
   b. 明示的に取り消されている → rejected（phase: "cancelled"）

Step 4: 対象 Node の一致チェック
   Confirmation.node_id ≠ apply_request.node_id → rejected（phase: "node_mismatch"）

Step 5: 変更内容の一致チェック
   Confirmation.proposed_change.to ≠ apply_request.confirm_status
     → rejected（phase: "change_mismatch"）

Step 6: 前提状態の一致チェック
   Node の現在 status ≠ Confirmation.proposed_change.from
     → reconfirm_required（「承認時と状態が変わっています」）
```

### 5.2 各ステップの判定結果

| Step | 検証内容 | 失敗時の outcome | 人間への伝え方 |
|------|---------|-----------------|-------------|
| 1 | 承認が存在するか | `rejected` | 「この承認 ID は見つかりませんでした」 |
| 2 | 使用済みでないか | `rejected` | 「この承認は既に使用されています」 |
| 3 | 失効していないか | `rejected` | 「この承認は期限切れです」 |
| 4 | 対象 Node が一致するか | `rejected` | 「承認された Node と対象が異なります」 |
| 5 | 変更内容が一致するか | `rejected` | 「承認された変更内容と一致しません」 |
| 6 | 前提状態が一致するか | `reconfirm_required` | 「承認時から状態が変わっています。再承認が必要です」 |

### 5.3 Step 6 と reconfirm_required の設計

Step 6 だけが `rejected` ではなく `reconfirm_required` を返す。

理由：  
Step 1〜5 の失敗は「承認自体が無効」であり、  
元の承認を修正しても解決しない。  
Step 6 の失敗は「承認は有効だが前提が変わった」であり、  
人間が状況を再確認して新たに承認すれば解決する。

`reconfirm_required` は 17 §10.2 (1)（遷移拒否時の再提案義務）にも対応する。  
Executor は `valid_transitions` を返すが、  
**自分で候補を選んでリトライすることは禁止**。  
人間が候補を見て再承認する。

---

## 6. 消費ルール（consumed の管理）

### 6.1 いつ消費するか

| Skill の応答 | Confirmation の扱い | 理由 |
|-------------|-------------------|------|
| **Apply 成功**（200, applied: true） | **消費する**（consumed = true） | 変更が確定した。この承認の目的は達成された |
| **遷移拒否**（422） | **消費しない** | Skill が拒否した = 変更は未実行。23 §3.3 に従い、承認は再利用可能 |
| **サーバーエラー**（500） | **消費しない** | 一時的な障害の可能性がある。承認は有効なまま |
| **検証失敗**（Step 1〜5） | **消費しない** | Apply まで到達していない |
| **前提不一致**（Step 6） | **消費しない**が**失効扱いにする** | 前提が崩れた承認は再利用すべきでない |

### 6.2 消費しない場合の処理

承認が消費されなかった場合、  
Executor は以下を**必ず**行う。

1. 未消費の事実を ExecutorResult に記録する
2. 失敗理由を人間に報告する
3. **自動リトライしない**

人間が報告を確認し、  
必要なら新たな提案 → 承認のサイクルを経て再度 Executor を呼ぶ。

### 6.3 422 拒否時の扱い（17 §10.2 (1) の具体化）

```
1. estimate-status Apply が 422 を返す
2. Executor は Confirmation を消費しない
3. ExecutorResult.outcome = "reconfirm_required"
4. ExecutorResult.reconfirm.valid_transitions に 422 応答の候補を含める
5. Executor は候補から自動選択しない
6. 人間に「遷移が拒否されました。以下の候補から再承認してください」と報告
7. 人間が新たな status を選び、新たな Confirmation を生成
8. 新たな Executor 呼び出し
```

**禁止されるパターン**：
```
❌ 422 → Executor が valid_transitions から候補を選ぶ → 再 Apply
```
これは「Executor が判断している」ことに等しく、§1.3 に違反する。

---

## 7. human_ui からの直接 Apply との関係

### 7.1 2 つの Apply 経路

context-os には 2 つの Apply 経路が存在する。

| 経路 | 仕組み | Executor の関与 |
|------|--------|---------------|
| **経路 A：人間 UI が直接 Apply** | ダッシュボードで「この状態にする」→ estimate-status Apply（source: "human_ui"） | **関与しない** |
| **経路 B：Executor が代行 Apply** | エージェント提案 → 人間が承認 → Executor が Apply（source: "ai_agent" + confirmation） | **Executor が実行** |

### 7.2 どちらが「正」か

**両方とも正しい経路**であり、排他ではない。

| 観点 | 経路 A（直接） | 経路 B（Executor） |
|------|-------------|-------------------|
| 人間の関与 | ボタンを押す = 承認 + 実行が同時 | 承認と実行が分離 |
| 適するケース | 人間がダッシュボードを見ながら操作する場合 | エージェントが提案し、人間が後から承認する場合 |
| Confirmation | 暗黙的に生成（23 §4.3） | 明示的に生成 |
| source | `human_ui` | `ai_agent` |
| 監査の粒度 | 「人間が操作した」 | 「エージェントが提案 → 人間が承認 → Executor が実行した」 |

### 7.3 使い分けの指針

| シナリオ | 推奨経路 |
|---------|---------|
| 人間がダッシュボードで Node を見て即座に status を変えたい | **経路 A** |
| Observer / Advisor が提案を出し、人間が後から一括承認する | **経路 B** |
| バッチ処理結果を人間がレビューし、承認済みのものを適用する | **経路 B** |
| チャット（ChatGPT）経由で人間が「それで OK」と承認する | **経路 B** |

**経路 B が必要になるのは、承認と実行のタイミングが分離するとき**である。  
人間が目の前で操作する場合は、経路 A で十分。

---

## 8. 処理フロー

### 8.1 正常系フロー

```
1. ExecutorRequest を受信
2. confirmation_id から Confirmation Object を取得
3. 検証フロー（§5）を実行
   → すべて OK の場合のみ続行
4. estimate-status Apply を呼び出す
   - source: "ai_agent"
   - confirmation: Confirmation Object の内容
   - confirm_status: apply_request.confirm_status
   - intent / reason: apply_request から取得
5. Apply の応答を確認
   - 200（成功） → Step 6 へ
   - 422（拒否） → reconfirm_required を返す（§6.3）
   - 500（エラー） → error を返す
6. Confirmation を消費済みに更新
   consumed = true, consumed_at = now
7. ExecutorResult（outcome: "applied"）を生成
8. 人間に結果を報告
```

### 8.2 フローの中で「やらない」こと

| ステップ | やること | やらないこと |
|---------|---------|------------|
| 検証 | Confirmation の有効性確認 | 「代わりにこの承認でどうですか」の提案 |
| Apply 呼び出し | 承認内容をそのまま渡す | 内容の改変・追加・省略 |
| 422 受信 | reconfirm_required を返す | valid_transitions から自動選択してリトライ |
| 結果報告 | 事実（成功/失敗/理由）を返す | 「次はこうすべき」の提案 |
| 消費更新 | consumed = true に更新 | 複数の承認を一度に消費 |

---

## 9. 構造的ガード

Executor が「実行するが、判断しない」を守る仕組みは、  
以下の 4 層で構成される。

### Layer 1：Confirmation 必須

Apply を呼ぶには有効な Confirmation Object が必要。  
Confirmation なしの Apply は構造的に不可能。

### Layer 2：検証フロー

6 段階の検証（§5）が、  
承認の有効性・対象の一致・内容の一致を確認する。  
検証に通らない限り Apply には到達しない。

### Layer 3：改変禁止

Executor は入力（ExecutorRequest）の内容を  
一切改変せずに Skill に渡す。  
「少し変えたほうがいい」という判断は Executor の責務外。

### Layer 4：自動リトライ禁止

422 拒否時に Executor が自動で別の候補を試すことは禁止。  
失敗は常に人間に返す。  
「もう一度試す」の判断は人間が行う。

---

## 10. 将来の拡張

### 10.1 一括 Executor（BatchApplier）

人間が複数の承認を一括で与え、Executor が順次実行するパターン。

- 各承認に対して 1 回ずつ Apply を実行（1 承認 1 Apply は不変）
- 途中で失敗した場合、残りは実行せず人間に報告
- 成功分は消費済み、失敗分は未消費

### 10.2 他の Skill の Executor

estimate-status 以外の Skill（将来の estimate-temperature、children 作成等）に対しても、  
Executor は同じ構造（Confirmation 消費 → Apply → 結果報告）で対応できる。

その場合、Confirmation Object の `proposed_change.type` で  
対象 Skill を判別する。

### 10.3 他の Level 3 エージェントを設計するとき

本ドキュメントを**テンプレート**として使う。  
Level 3 特有のセクションとして以下を必ず含めること。

| 追加セクション | 必須内容 |
|-------------|---------|
| §5 検証フロー | 23 §4.2 を手順として具体化 |
| §6 消費ルール | どの応答で消費するか / しないかの方針 |
| §7 直接 Apply との関係 | Executor 経路と直接操作経路の使い分け |
| §9 構造的ガード | 改変禁止・リトライ禁止の明文化 |

---

## 11. この文書の位置づけ

本ドキュメントは、

- context-os 初の Level 3 サブエージェント設計書
- 将来の Level 3 エージェント設計テンプレート
- 20_SubAgent_Catalog.md §6 の具体化
- 23_Human_Confirmation_Model.md の主要な消費者の定義
- `25_Boundary_NextJS_PythonAgent.md` と併せて、  
  「Executor は Python で動くが、Apply 先は必ず Next.js」を定義

として機能する。

Executor に迷った場合は、  
**「この動作に、Executor 自身の判断が含まれていないか？」**  
を判断基準とする。  
Executor が「考えている」瞬間があれば、それは設計の逸脱である。
