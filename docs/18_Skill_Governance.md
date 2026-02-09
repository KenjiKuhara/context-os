# 18_Skill_Governance.md
## Skill ガバナンス：共通ルール

---

## 0. この文書の目的

本ドキュメントは、context-os における  
**Skill の呼び出し・連鎖・確定に関する共通ルール**を定義する。

個別の Skill Contract（17_Skill_EstimateStatus.md 等）は  
本ドキュメントを前提として参照する。

本ドキュメントは以下を前提とする。

- 00_Vision_NorthStar.md §5.4 — AI は管理者、人は最終責任者
- 03_Non_Goals.md §1.3 — AI 秘書にはならない
- 03_Non_Goals.md §2.1 — 勝手なステータス確定の禁止
- 10_Architecture.md §3 — AI に考えさせるが、決めさせない

---

## 1. アクターの定義と役割分担

context-os には 3 種類のアクターが存在する。

### 1.1 人間（User）

| できること | できないこと |
|-----------|------------|
| intent（何が起きたか）を入力する | status を直接指定して確定する（03_Non_Goals §2.2） |
| AI の提案を「確認」する | temperature を直接操作する（03_Non_Goals §2.3） |
| 「違う」と指摘する | |
| Apply を承認する | |

**重要な前提**（00_Vision §5.4）：  
人は「管理」しない。人は「再開」し、「判断」するだけ。

### 1.2 サブエージェント / LLM

| できること | できないこと |
|-----------|------------|
| Node の観測・分析を行う | Apply を人間の確認なしに実行する |
| intent / reason を構成する | DB を直接操作する |
| Preview を呼んで候補を取得する | history を直接書き込む |
| 人間に「提案」として結果を返す | status / temperature を確定する |

**重要な前提**（10_Architecture §3.2）：  
AI に考えさせるが、決めさせない。

### 1.3 Skill（App Server の API）

| できること | できないこと |
|-----------|------------|
| 遷移ルールを検証する | 推定の判断を行う（推定は AI の責務） |
| status を確定する | 呼び出し元を無条件に信頼する |
| history を記録する | |
| 不正遷移を拒否する | |

**重要な前提**（10_Architecture §2.4）：  
Skill はビジネスルールの唯一の実行場所。

---

## 2. Preview / Apply の基本原則

すべての Skill に共通する最も重要なルール。

### 2.1 Preview は無制限

- Preview（副作用のない読み取り・推定）は、  
  **いつ・誰が・何回呼んでもよい**
- Preview は「考える」行為であり、  
  10_Architecture §3.1「状態の提案は AI の責務」に対応する
- 人間 UI・エージェント・バッチ・Skill 間連鎖のいずれからも制限なし

### 2.2 Apply は人間確認必須

- Apply（状態を確定し、history に記録する操作）は、  
  **人間の確認を経た場合にのみ許可する**
- これは context-os の最上位原則  
  「判断を奪わず、判断を支える」（00_Vision §5.4）を  
  runtime で担保するための構造的ガードである

### 2.3 なぜこの区別が必要か

| 制限なし（Preview） | 制限あり（Apply） |
|-------------------|-----------------|
| 思考の整理を支援する | 思考の結果を確定する |
| 間違えても影響がない | 間違えると履歴に残る |
| 何度でもやり直せる | 取り消しが困難 |
| AI の得意領域 | 人間の責任領域 |

---

## 3. Apply ガードの設計：source + confirmation

Apply を安全に制御するための 2 層構造。

### 3.1 Layer 1：source（誰が呼んだか）

Apply リクエストに `source` フィールドを含める。

| source 値 | 意味 |
|-----------|------|
| `human_ui` | 人間がダッシュボード等の UI から直接操作した |
| `ai_agent` | AI エージェントがプログラムとして呼び出した |
| `mcp` | LLM が MCP ツール経由で呼び出した |
| `batch` | 定期バッチ処理が呼び出した |
| `skill_chain` | 別の Skill が内部で呼び出した |

**目的**：history に「誰が起点か」を記録し、監査可能にする。  
source だけでは「防止」はしない（記録のみ）。

### 3.2 Layer 2：confirmation（人間が確認したか）

Apply リクエストに `confirmation` フィールドを含める。

```
confirmation: {
  confirmed_by: "human" | "auto",
  confirmed_at: "ISO 8601 datetime"
}
```

**目的**：人間の確認を通過した証跡を Apply に添付する。

### 3.3 source × confirmation の許可マトリクス

| source | confirmation | Apply 許可 | 理由 |
|--------|-------------|-----------|------|
| `human_ui` | 不要 | **許可** | UI 操作そのものが確認行為 |
| `ai_agent` | `confirmed_by: "human"` 必須 | **条件付き許可** | 人間の承認証跡がある |
| `mcp` | `confirmed_by: "human"` 必須 | **条件付き許可** | LLM の背後に人間の承認がある |
| `batch` | — | **禁止** | 03_Non_Goals §2.1「勝手なステータス確定」 |
| `skill_chain` | — | **禁止** | Skill → Skill の Apply 連鎖は人間不在 |

### 3.4 Phase 2-α（受け皿実装・現在）

- `source` と `confirmation` はともに **optional**（後方互換）
- 省略時は `human_ui` と見なす
- Apply 時に `source` / `confirmation` の全フィールドが  
  `node_status_history` に記録される（NULL 許容）
- **source が `"batch"` または `"skill_chain"` の Apply は 403 で拒否する**  
  （§3.3 の禁止ルールのうち、source ベースのガードのみ先行実装）
- confirmation の検証（consumed チェック・失効判定等）は未実装  
  （Phase 2-β で追加）

### 3.5 Phase 2-β（human_ui の runtime 成立・現在）

- **human_ui 経路は confirmation が runtime で成立している**
  - ダッシュボードが Apply 時に Confirmation Object を自動生成
  - `source: "human_ui"` を明示的に送信
  - estimate-status が confirmation の最低限検証を実施  
    （UUID 妥当性・confirmed_by・proposed_change 一致）
  - Apply 成功時に consumed=true を history に記録
- ai_agent / mcp の confirmation 必須化はまだ（後方互換維持）
- source 省略時は従来通り動作（検証スキップ）

### 3.6 Phase 2-γ（1 承認 1 Apply の runtime 成立・現在）

- **confirmation_events テーブルが Confirmation の SSOT**（方式 B）
- **POST /api/confirmations** で confirmation を DB に発行する
- **source が `human_ui` / `ai_agent` / `mcp` の Apply は confirmation_id 必須**
  - 無ければ 403 で拒否
  - DB の confirmation_events を参照し、consumed / 失効 / 一致を検証
  - Apply 成功時に confirmation_events.consumed=true に更新
- **1 承認 1 Apply が runtime で担保されている**
  - consumed 済みの confirmation_id は 409 で拒否
  - 期限切れ（24h）は 403 で拒否
  - node_id / proposed_change の不一致は 400 で拒否
- source 省略時は後方互換（検証スキップ）。Phase 3 で廃止予定

### 3.7 RLS による DB レベルの保護

`confirmation_events` テーブルには RLS が有効化されている。  
anon / authenticated ロールからの直接アクセスは完全に禁止され、  
すべての操作は Next.js API Routes（service_role）を経由する。  
これにより、source + confirmation の二層ガード（§3.1 / §3.2）を  
クライアント側からバイパスすることが DB レベルで不可能になっている。

### 3.8 Phase 3（source 必須化・将来）

- `source` を Apply リクエストの **required** に変更する
- source 省略時の後方互換を廃止する
- すべての Apply が confirmation_events 経由の検証を通る

---

## 4. Skill 間の連鎖ルール

Skill が別の Skill を内部で呼び出す場合のルール。

### 4.1 Preview 連鎖：許可

```
Skill A → Skill B (Preview) → 結果を Skill A の処理に利用
```

- 許可する
- Preview は副作用がないため、連鎖しても安全
- 例：resume/next が estimate-status の Preview を呼んで  
  「この Node の次の状態候補」を取得し、再開提案の材料にする

### 4.2 Apply 連鎖：禁止

```
Skill A → Skill B (Apply) → status が確定される
```

- **禁止する**
- Skill が別の Skill の Apply を連鎖呼び出しすると、  
  人間の確認なしに状態が確定される
- 00_Vision §5.4「思考の主導権が常に人間側にある」に違反する

### 4.3 正しいパターン：提案の返却

Skill A が「Skill B の Apply が必要だ」と判断した場合、  
Apply を直接呼ぶのではなく、  
**「Skill B の Apply を人間に提案する」レスポンスを返す**。

```
Skill A → 分析 → 「estimate-status で COOLING にすべき」
        → 人間に提案として返す
        → 人間が確認
        → 人間（or 承認済みエージェント）が estimate-status Apply を呼ぶ
```

---

## 5. history への記録原則

### 5.1 Apply は必ず history に記録する

- status が変わった場合も、変わらない場合も
- 04_Domain_Model.md §3.5「意味のある変化は必ず残す」

### 5.2 source を history に含める

- history レコードに `source` を記録する（拡張枠として予約）
- 将来、「この変更は誰が起点か」を追跡可能にする
- MVP では source は記録されない（フィールド未実装のため）

### 5.3 confirmation を history に含める

- history レコードに `confirmed_by` を記録する（拡張枠として予約）
- 将来、「人間が確認した変更か、自動適用か」を区別可能にする

---

## 6. 判断に迷ったときの最終チェック

新しい Skill や呼び出しパターンを追加するとき、  
必ず以下を問う。

> **「この Apply は、人間が確認しなくても安全か？」**

- Yes と言い切れる → Preview に分類すべき（副作用がないはず）
- No / 迷う → 人間確認を必須にする

> **「この Skill 連鎖は、人間を介さずに完結するか？」**

- Yes → Preview 連鎖か確認する。Apply が含まれるなら禁止。
- No → 正しい設計。提案として人間に返す。

---

## 7. この文書の位置づけ

本ドキュメントは、

- すべての Skill Contract（17, 19, ...）の共通前提
- サブエージェント設計時のガードレール
- MCP ツール定義時の許可/禁止判断の基準
- `25_Boundary_NextJS_PythonAgent.md` と併せて、  
  Next.js / Python の責務境界を定義する上位ルール

として機能する。

Skill ガバナンスに迷った場合は、  
**「判断を奪わず、判断を支えているか？」**  
を判断基準とする。
