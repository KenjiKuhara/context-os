# 23_Human_Confirmation_Model.md
## Human Confirmation Model：人間承認の一次仕様

---

## 0. この文書の目的

本ドキュメントは、context-os における  
**「人間の承認（confirmation）」のデータモデル・ライフサイクル・運用ルール**  
を定義する Single Source of Truth である。

18_Skill_Governance.md §3 が「source + confirmation で Apply を制御する」  
という**原則**を定めたのに対し、  
本ドキュメントはその原則を**データ構造と運用レベルで具体化する**。

本ドキュメントは以下を前提とする。

- 00_Vision_NorthStar.md §5.4 — 思考の主導権が常に人間側にある
- 00_Vision_NorthStar.md §7 — 100 点の成立条件
- 03_Non_Goals.md §1.3 — 判断を代行して決めない
- 03_Non_Goals.md §2.1 — 勝手なステータス確定の禁止
- 04_Domain_Model.md §3.5 — 履歴・観測用属性
- 10_Architecture.md §3.2 — AI に考えさせるが、決めさせない
- 17_Skill_EstimateStatus.md §10 — estimate-status 固有の Apply ガード
- 18_Skill_Governance.md §3 — source + confirmation の二層ガード設計

---

## 1. 「承認」とは何か

### 1.1 OS 上の意味

context-os における「承認（confirmation）」とは、

> **人間が、AI / エージェントの提案を確認し、  
> 「この変更を適用してよい」と明示的に意思表示した事実**

を指す。

承認は以下の 3 つの性質を持つ。

| 性質 | 説明 |
|------|------|
| **明示的** | 暗黙の同意（タイムアウト・デフォルト承認）は承認ではない |
| **一回性** | 1 つの承認は 1 つの Apply にのみ使用できる |
| **追跡可能** | 承認の事実は history に記録され、後から検証できる |

### 1.2 承認が「ない」もの

以下は承認を必要としない。

| 操作 | 理由 |
|------|------|
| Preview の呼び出し | 副作用がない（18 §2.1） |
| status unchanged の Apply（メモ記録） | 状態を変える行為ではない（17 §10.2 (2)） |
| 読み取り系 API の呼び出し | 副作用がない |

### 1.3 承認が「必要」なもの

以下は承認を必要とする。

| 操作 | 理由 |
|------|------|
| status を変更する Apply | 状態の確定は人間の責務（18 §2.2） |
| DONE / CANCELLED への遷移 | 不可逆性が高い（17 §10.2 (3)） |
| Node の構造変更（将来：子 Node 作成、relations 追加等） | 思考の構造を変える判断 |

---

## 2. Confirmation Object（最小データ構造）

### 2.1 定義

```
Confirmation {
  // === 識別 ===
  confirmation_id: string     // 承認の一意 ID（UUID）
  
  // === 誰が ===
  confirmed_by: "human"       // 承認者の種別（MVP では常に "human"）
  
  // === いつ ===
  confirmed_at: string        // 承認日時（ISO 8601）
  
  // === 何を ===
  node_id: string             // 対象 Node の ID
  proposed_change: {
    type: string              // 変更の種別（"status_change" / "structure_change" 等）
    from: string              // 変更前の値（例：現在の status）
    to: string                // 変更後の値（例：提案された status）
  }
  
  // === どうやって ===
  ui_action: string           // 承認を発生させた UI 操作の識別子
                              // 例："dashboard_apply_button"
                              //     "chat_approve_command"
                              //     "batch_review_accept"
  
  // === 消費状態 ===
  consumed: boolean           // この承認が Apply に使用済みか
  consumed_at: string | null  // 使用された日時（未使用なら null）
}
```

### 2.2 フィールドの設計根拠

| フィールド | なぜ必要か |
|-----------|-----------|
| `confirmation_id` | 1 承認 1 Apply を担保するための一意キー。再利用防止の基盤 |
| `confirmed_by` | 18 §3.2 の Layer 2。MVP では常に `"human"` だが、将来「チーム承認」等の拡張に備える |
| `confirmed_at` | 承認の時刻。失効判定の基準 |
| `node_id` | 承認が「どの Node に対するものか」を紐づける。別の Node への流用を防ぐ |
| `proposed_change` | 承認が「何を許可したか」を記録する。Apply 時に「承認内容と実際の変更が一致するか」を検証する基盤 |
| `ui_action` | 承認が「どの UI 操作から発生したか」を追跡する。監査ログの一部 |
| `consumed` / `consumed_at` | 1 承認 1 Apply の担保。consumed === true の承認は再利用できない |

### 2.3 18_Skill_Governance.md §3 との関係

18 §3.2 で定義された confirmation の簡易構造：

```
confirmation: {
  confirmed_by: "human" | "auto",
  confirmed_at: "ISO 8601 datetime"
}
```

本ドキュメントの Confirmation Object はこれを**拡張・具体化**したものである。

| 18 §3.2 のフィールド | 本 doc での対応 |
|--------------------|---------------|
| `confirmed_by` | `confirmed_by`（同一。値域を将来拡張可能に） |
| `confirmed_at` | `confirmed_at`（同一） |
| — | `confirmation_id`（新規：一意性の担保） |
| — | `node_id`（新規：対象の特定） |
| — | `proposed_change`（新規：承認内容の記録） |
| — | `ui_action`（新規：操作の追跡） |
| — | `consumed` / `consumed_at`（新規：再利用防止） |

18 §3 は**原則**として有効であり、変更しない。  
本 doc は 18 §3 の**データモデルとしての具体化**である。

---

## 3. 承認のライフサイクル

### 3.1 状態遷移

```
[提案]  →  [承認]  →  [消費済み]
              ↓
           [失効]
```

| 状態 | 意味 | consumed | consumed_at |
|------|------|---------|-------------|
| **提案（proposed）** | AI / エージェントが変更を提案している。まだ承認されていない | — | — |
| **承認（confirmed）** | 人間が確認し、Apply を許可した。まだ使用されていない | `false` | `null` |
| **消費済み（consumed）** | 承認が Apply に使用された | `true` | 使用日時 |
| **失効（expired）** | 承認が一定期間内に使用されなかった、または対象 Node の状態が変わった | — | — |

### 3.2 「提案」から「承認」への遷移

提案が承認に遷移するのは、**人間が明示的に UI 操作を行ったとき**のみ。

| UI 操作 | 生成される Confirmation |
|---------|----------------------|
| ダッシュボードで「この状態にする」ボタンをクリック | `ui_action: "dashboard_apply_button"` |
| チャットで「それで OK」と返答 | `ui_action: "chat_approve_command"` |
| バッチ結果一覧で「承認」ボタンをクリック | `ui_action: "batch_review_accept"` |

**暗黙の承認は存在しない**。  
タイムアウト・デフォルト承認・「何も言わなければ OK」は  
context-os の承認とは認めない。  
00_Vision §5.4「思考の主導権が常に人間側にある」を守るため。

### 3.3 「承認」から「消費済み」への遷移

Skill の Apply が実行され、成功した時点で  
`consumed = true`、`consumed_at = 実行日時` に更新される。

Apply が失敗した場合（422 遷移拒否・500 エラー等）は  
承認は消費されない（再利用可能）。  
ただし **失敗時は人間に結果を報告する義務がある**（20 §6.4 制約 3）。

### 3.4 失効条件

承認は以下の条件で**失効する**。

| 失効条件 | 理由 |
|---------|------|
| **承認から一定時間が経過した** | 承認時の文脈が古くなっている可能性がある。時間閾値は設定可能（デフォルト：24 時間） |
| **対象 Node の status が承認時と変わった** | 承認の前提（`proposed_change.from`）が崩れている。別の変更が先に適用された |
| **承認が明示的に取り消された** | 人間が「やっぱりやめる」と操作した |

失効した承認は Apply に使用できない。  
新たな提案 → 承認のサイクルを経る必要がある。

---

## 4. 1 承認 1 Apply の担保

### 4.1 原則

**1 つの Confirmation Object は、1 回の Apply にのみ使用できる。**

これは以下を防ぐための構造的ガードである。

| 脅威 | 防止方法 |
|------|---------|
| 1 つの承認で複数 Node の status を変更する | `node_id` で対象を限定。別 Node には使えない |
| 1 つの承認で同じ Node に複数回 Apply する | `consumed` フラグで使用済みを追跡。consumed === true は拒否 |
| 古い承認を使い回す | 失効条件（§3.4）で時間超過・状態変化を検出 |
| 承認内容と異なる変更を Apply する | `proposed_change` と Apply の内容を照合。不一致は拒否 |

### 4.2 Apply 時の検証フロー

```
1. Apply リクエストを受信
2. confirmation_id を取得
3. Confirmation Object を検索
4. 検証：
   a. confirmation_id が存在するか
   b. consumed === false か
   c. confirmed_at から一定時間以内か
   d. node_id が Apply 対象と一致するか
   e. proposed_change.to が confirm_status と一致するか
   f. proposed_change.from が Node の現在 status と一致するか
5. すべて OK → Apply 実行 → consumed = true
6. いずれか NG → Apply 拒否 → エラー理由を返す
```

### 4.3 human_ui の場合の簡略化

18 §3.3 により、`source: "human_ui"` の場合は confirmation が不要。

これは人間が UI を直接操作しているため、  
**UI 操作そのものが承認行為**だからである。

この場合、Confirmation Object は暗黙的に生成される：

- `confirmation_id`：リクエストごとに自動生成
- `confirmed_by`：`"human"`
- `confirmed_at`：リクエスト受信時刻
- `ui_action`：`"human_ui_direct"`
- `consumed`：Apply 成功時に `true`

history には `source: "human_ui"` とともに  
この暗黙 Confirmation が記録される。

---

## 5. 記録の方法

### 5.1 記録先の設計

承認の記録先は 2 つの選択肢がある。

| 方式 | 説明 | メリット | デメリット |
|------|------|---------|-----------|
| **A. history 拡張** | `node_status_history` に confirmation フィールドを追加 | テーブル追加なし。history と承認が 1 レコードに統合 | history テーブルの責務が広がる |
| **B. 専用テーブル** | `node_confirmations` テーブルを新設 | 責務が明確。失効管理が容易 | テーブル追加。history との JOIN が必要 |

**採用方針：MVP は A（history 拡張）、Phase 2 以降は B に移行可能**

理由：
- 04_Domain_Model.md §3.5 の設計思想に従い、  
  MVP では「情報の損失リスクが低い方」を選ぶ
- history に confirmation を含めることで、  
  「この status 変更は誰が承認したか」が 1 レコードで完結する
- Phase 2 でテーブルを分離する場合、  
  history レコード内の confirmation フィールドを  
  `node_confirmations` テーブルに移行する

### 5.2 history レコードへの記録形式（MVP）

既存の `node_status_history` レコードに  
以下のフィールドを追加する（拡張枠）。

```
node_status_history {
  // === 既存フィールド ===
  node_id: string
  from_status: string
  to_status: string
  reason: string

  // === 拡張フィールド（承認記録） ===
  source: string | null           // 18 §3.1 の source 値
  confirmation_id: string | null  // Confirmation Object の ID
  confirmed_by: string | null     // "human" | null
  confirmed_at: string | null     // 承認日時
  ui_action: string | null        // 承認操作の識別子
}
```

すべて null 許容とすることで、  
既存レコード（source / confirmation 未実装時代のもの）との後方互換を保つ。

### 5.3 Phase 2：専用テーブル分離時の指針

`node_confirmations` テーブルを導入する場合：

- Confirmation Object（§2.1）の全フィールドをカラムとして持つ
- `node_status_history` からは `confirmation_id` のみを外部キーとして参照
- 既存の history レコード内の confirmation フィールドは  
  マイグレーションで `node_confirmations` に移行する
- 移行後も `confirmation_id` による JOIN で  
  「この history はどの承認に基づくか」を追跡可能

---

## 6. source との統合

### 6.1 source と confirmation の関係（再整理）

18 §3 で定義された 2 層は以下の関係にある。

```
source:        「誰が Apply を呼んだか」（呼び出し元の識別）
confirmation:  「人間が OK したか」（承認の証跡）
```

source は**記録**のために存在する。  
confirmation は**許可**のために存在する。

| | source | confirmation |
|---|--------|-------------|
| 目的 | 監査 | 許可 |
| なければ | 追跡できない | Apply を拒否 |
| 値 | 呼び出し元を示す文字列 | 承認の Confirmation Object |

### 6.2 Apply リクエストの完全な構造

source + confirmation を含む Apply リクエストの完全形：

```json
{
  "intent": "返信待ちになった",
  "confirm_status": "WAITING_EXTERNAL",
  "reason": "クライアントからの回答を待つため",
  "source": "ai_agent",
  "confirmation": {
    "confirmation_id": "conf_abc123",
    "confirmed_by": "human",
    "confirmed_at": "2026-02-08T12:00:00Z",
    "ui_action": "dashboard_apply_button"
  }
}
```

MVP ではこの構造のうち source / confirmation は optional。  
省略時は `source: "human_ui"` + 暗黙 Confirmation として扱う。

---

## 7. 再承認が必要なケース

### 7.1 422 遷移拒否後

17 §10.2 (1) により、遷移拒否後に再 Apply するには  
新たな承認が必要（既存の承認は対象の status が前提と異なるため失効）。

```
Apply（CAPTURED → DONE）→ 422 拒否
→ valid_transitions を人間に再提示
→ 人間が新たな status を確認（新 Confirmation 生成）
→ Apply（CAPTURED → CLARIFYING, 新 confirmation_id）
```

### 7.2 対象 Node の状態が変わった後

別の Apply が先に実行され、Node の status が変わった場合、  
既存の承認は `proposed_change.from` と現在の status が不一致になり失効する。

```
承認時：IN_PROGRESS → WAITING_EXTERNAL
→ 別の操作で IN_PROGRESS → BLOCKED に変更
→ 元の承認は失効（from が IN_PROGRESS だが、現在は BLOCKED）
→ 新たな提案 → 新たな承認が必要
```

### 7.3 時間経過による失効後

24 時間（デフォルト）を超えた承認は失効する。  
同じ変更を行うには、新たな承認を取得する。

---

## 8. MVP での段階的導入

### 8.1 Phase 1（現在）

- source / confirmation はともに optional
- 省略時は `human_ui` と見なす
- Confirmation Object は生成されない
- history には source / confirmation 関連フィールドなし
- **docs 上の設計決定のみ。コードによる強制なし**

### 8.2 Phase 2-α（受け皿実装）

- DB: `node_status_history` に監査フィールド 8 列を追加（NULL 許容）
- API: `source` / `confirmation` を optional で受け取り history に保存
- ガード: `source` が `"batch"` / `"skill_chain"` の Apply は 403 で拒否
- confirmation の検証はまだ行わない

### 8.3 Phase 2-β（human_ui の runtime 成立・現在）

- **UI（ダッシュボード）が Apply 時に Confirmation Object を自動生成する**
  - `confirmation_id`: UUID v4（`crypto.randomUUID()`）
  - `confirmed_by`: `"human"`
  - `confirmed_at`: 操作時刻（ISO 8601）
  - `ui_action`: `"dashboard_apply_button"`
  - `proposed_change`: `{ type: "status_change", from: current, to: target }`
- **UI は `source: "human_ui"` を明示的に送信する**（省略しない）
- **API（estimate-status）は `source=human_ui` の Apply で confirmation を検証する**
  - `confirmation_id` が UUID として妥当か
  - `confirmed_by === "human"` か
  - `confirmed_at` が存在するか
  - `proposed_change.to` が `confirm_status` と一致するか
  - `proposed_change.from` が Node の現在 status と一致するか
  - 検証失敗時は 400 で拒否
- **Apply 成功時は `consumed=true`, `consumed_at=now` を history に記録する**
  - status_changed true/false 問わず（「メモだけ残す」でも消費）
  - Apply 失敗（422 / 500）の場合は consumed を書かない
- **方式 A（history 拡張）で消費を表現**している
  - confirmation の記録は `node_status_history` の拡張カラムに格納
  - 専用テーブル `node_confirmations` はまだ導入しない
- **ai_agent / mcp の confirmation 必須化はまだ行わない**（後方互換維持）
  - `source` 省略時は従来通り動作（human_ui と見なすが検証はスキップ）

### 8.4 Phase 2-γ（方式 B・1 承認 1 Apply の runtime 成立・現在）

**方式 B（専用テーブル）への移行が完了した。**

- **SSOT は `confirmation_events` テーブルに移行した**
  - `node_status_history` の confirmation 関連カラムは監査コピーとして残る
  - consumed の真の状態は `confirmation_events.consumed` が持つ
- **`POST /api/confirmations` API を新設**
  - human_ui は Apply 前にこの API を呼んで confirmation を DB に発行する
  - サーバーが confirmation_id を UUID v4 で生成し、expires_at = now + 24h を設定
  - クライアント側の `crypto.randomUUID()` 直生成は廃止
- **estimate-status Apply は confirmation_events を DB 参照で検証する**
  - source が `human_ui` / `ai_agent` / `mcp` の場合、confirmation_id 必須（無ければ 403）
  - 検証項目（23 §4.2 の 6 段階を runtime で実装）:
    1. confirmation_id が UUID として妥当か
    2. confirmation_events に存在するか（404）
    3. consumed === false か（409: already consumed）
    4. expires_at > now() か（403: expired）
    5. node_id が一致するか（400）
    6. proposed_change.from/to が current_status / confirm_status と一致するか（400/409）
  - Apply 成功時に `consumed=true`, `consumed_at=now` に更新
  - Apply 失敗（422 遷移拒否 / 500 エラー）では consumed しない
- **ai_agent / mcp は confirmation_id 必須**（Phase 2-β の後方互換を超えて強制化）
- **source 省略時は後方互換**（検証スキップ、confirmation 不要）
  - これは Phase 3 で廃止予定

### 8.5 RLS（Row Level Security）

`confirmation_events` テーブルには RLS が有効化されており、  
anon / authenticated ロールからの直接アクセスは**完全に禁止**されている。  
すべての操作は Next.js API Routes（service_role）を経由する。  
これにより、クライアントが confirmation を直接改ざん・偽造・消費することを  
DB レベルで防止している（10_Architecture §2.4「App がビジネスルールの唯一の実行場所」）。

### 8.6 期限切れ confirmation の掃除

`expires_at < now()` かつ `consumed = false` のレコードは、  
定期的に削除してよい。

**削除が安全な理由**：  
confirmation_events は「承認の発行と消費を管理する一時テーブル」であり、  
監査の本体は `node_status_history` に confirmation_id / confirmed_by 等として  
コピーされている。Apply が成功した confirmation は history に記録されており、  
期限切れの未消費 confirmation は「使われなかった承認」であるため、  
削除しても監査証跡に影響しない。

掃除は `cleanup_expired_confirmations()` SQL 関数で実行される。  
Supabase の pg_cron 拡張を使い、1 時間ごとに自動実行する。

### 8.7 Phase 3（本格運用時）

- `source` を Apply リクエストの required に変更し、後方互換を廃止
- 監査ダッシュボード（「誰が何をいつ承認したか」の可視化）

---

## 9. 既存 doc との参照関係

| doc | 本 doc との関係 |
|-----|---------------|
| **18_Skill_Governance.md §3** | source + confirmation の**原則**を定義。本 doc はそのデータモデルの SSOT |
| **17_Skill_EstimateStatus.md §10** | estimate-status 固有の承認ルール（遷移拒否後の再承認、DONE/CANCELLED の厳格化）。本 doc の Confirmation Object を使用する |
| **17_Skill_EstimateStatus.md §6.1** | source / confirmation の拡張枠としての予約。本 doc が具体的なデータ構造を定義 |
| **19_SubAgent_Observer.md** | Apply を呼ばないため承認は不要。本 doc §1.2 の「承認が不要な操作」に該当 |
| **20_SubAgent_Catalog.md §6** | Level 3（Executor）が承認後に Apply を代行する。本 doc の Confirmation Object が Executor の入力になる |
| **21_SubAgent_Organizer.md** | Apply を呼ばないため承認は不要。Level 0 と同様 |
| **22_SubAgent_Advisor.md** | Apply を呼ばないため承認は不要。提案のみ |
| **04_Domain_Model.md §3.5** | history / events の記録方針。本 doc の history 拡張はここに準拠 |
| **25_Boundary_NextJS_PythonAgent.md** | Confirmation の検証・消費は Next.js、Python は confirmation_id を添付するだけ。境界の技術的具体化 |

---

## 10. この文書の位置づけ

本ドキュメントは、

- Confirmation Object の**唯一のデータモデル定義**
- 承認ライフサイクルの**唯一の運用ルール**
- 18_Skill_Governance.md §3 のデータレベルでの**具体化**
- Level 3（Executor）実装の**前提条件**

として機能する。

承認に迷った場合は、  
**「この Apply は、人間が今この瞬間に OK と言ったか？」**  
を判断基準とする。  
「以前 OK と言った」「たぶん OK だろう」は承認ではない。
