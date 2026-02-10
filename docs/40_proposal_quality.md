# 提案の品質（Proposal Quality）— Phase 4

## 0. この文書の目的

AI（Organizer / Advisor）が **「それっぽい提案」** ではなく、**ユーザーがそのまま実行できる「使える提案」** を返すための仕様を定める。

- **提案（proposal）**: 人間が「やるかやらないか」を決める材料。AI は提案だけし、実行はしない。
- **品質**: 提案が「具体的で、次のアクションに結びつく」程度。本 doc で Must / Should とサンプルで定義する。

Organizer と Advisor の **役割を成果物で明確に分け**、評価基準・出力フォーマット・失敗例・自動テスト用サンプルを固定する。

**前提**: 21_SubAgent_Organizer.md（Organizer 設計）、22_SubAgent_Advisor.md（Advisor 設計）を満たす出力であること。

---

## 1. 提案品質の定義

### 1.1 「使える提案」とは

| 観点 | 説明（中学生でも分かるように） |
|------|--------------------------------|
| **具体的** | 「なんとなくやったほうがよさそう」ではなく、「この Node をこう分ける」「この 3 案のどれかを選ぶ」のように、**誰が読んでも何を指しているか分かる**。 |
| **次の一手が分かる** | 読んだ人が「じゃあ自分は次に何をすればいいか」が分かる。ボヤいたり要約だけで終わらない。 |
| **必要情報が揃っている** | 判断に必要な「どの Node か」「なぜそう言えるか」「選んだ場合のリスク」が欠けていない。 |
| **判断基準が明示されている** | 「何を基準に選ぶか・決めるか」が書いてある。AI がこっそり「正解」を決めていない。 |
| **リスクが書いてある** | 各案や各提案について「こうするとこういうリスクがある」が分かる。隠さない。 |

「アドバイス」を禁止するのではなく、**次の一手・必要情報・判断基準・リスクを必須にする** ことで“実務で使える”形にそろえる。

### 1.2 Organizer と Advisor の成果物の違い

| 項目 | Organizer（Level 1） | Advisor（Level 2） |
|------|----------------------|--------------------|
| **役割（一言）** | Node 群を「整理・構造化」する提案。関連・分解・グループ化。 | ある Node について「次の一手・選択肢」を複数案で出す。 |
| **成果物** | OrganizerReport（分解案・グループ案・関連案・全体要約） | AdvisorReport（選択肢 2 つ以上・判断観点・次の一手・リスク） |
| **誰が使うか** | 人間が「机の上を整理したい」ときに見る | 人間が「この Node、どうしよう」と迷っているときに見る |
| **実行に直結するか** | 間接的（整理した結果、何をやるかは別途決める） | 直接的（案の 1 つを選べば、そのまま次のアクションになる） |

---

## 2. 評価基準の考え方

- **Must（最低品質ライン）**: これを満たさない提案は「使えない」とする。自動テストでもここまでを必須とする。
- **Should（高品質）**: 満たすとユーザー体験がよく、信頼が上がる。実装・プロンプトでは優先して満たす。

---

## 3. Organizer 出力テンプレート

### 3.1 役割の一言

**Organizer** は「Node 群を横断して、関連・分解・グループ化・全体像を提案する」エージェント。  
出力はすべて **提案** であり、DB の書き換えや「〜すべき」という断定はしない。

### 3.2 OrganizerReport の形（JSON）

```json
{
  "decomposition_proposals": [
    {
      "target_node_id": "string（対象 Node の ID）",
      "target_title": "string（対象 Node のタイトル）",
      "reason": "string（なぜ分解が必要に見えるか）",
      "suggested_children": [
        {
          "title": "string",
          "context": "string（子の途中内容・役割）",
          "suggested_status": "string（初期 status の提案、任意）"
        }
      ]
    }
  ],
  "grouping_proposals": [
    {
      "group_label": "string（グループの名前案）",
      "reason": "string（なぜこのグループに見えるか）",
      "node_ids": ["string"]
    }
  ],
  "relation_proposals": [
    {
      "from_node_id": "string",
      "to_node_id": "string",
      "relation_type": "string（例: same_topic, depends_on, related）",
      "reason": "string"
    }
  ],
  "summary": "string（机の上の構造的な概観）"
}
```

### 3.3 Organizer：Must（最低品質ライン）

| 項目 | 条件 | 補足 |
|------|------|------|
| **ID が存在する** | すべての `target_node_id` / `from_node_id` / `to_node_id` / `node_ids` の要素が、入力に存在する Node の ID である | 存在しない ID を出すと「そのまま実行できない」 |
| **reason が空でない** | 各 proposal に `reason` が存在し、1 文以上ある | 「なぜこの提案か」が無いと判断できない |
| **分解案の children が 2 以上** | `decomposition_proposals` の各要素で `suggested_children` が 2 件以上（1 件は「分解」にならない） | 実務では「2 つ以上に分ける」が分解の意味になる |
| **断定語を使わない** | 「〜べき」「〜してください」「〜が必要です」を含まない | Organizer は「整理の提案」であり判断は人間（21 §5.3） |
| **summary が存在する** | `summary` が空でない | 全体像が無いと「机の上」の把握ができない |

### 3.4 Organizer：Should（高品質）

| 項目 | 条件 | 補足 |
|------|------|------|
| **次の一手が分かる** | summary または各 proposal の末尾に「まず◯◯から見ると良さそう」のような一文がある | ユーザーが「じゃあ何から手を付けるか」が分かる |
| **グループ・関連にラベルが分かりやすい** | `group_label` / `relation_type` が具体的（例: 「同じプロジェクト」「A が終わらないと B に進めない」） | 抽象的な「関連」だけだと実行に結びつきにくい |
| **語調が提案である** | 「〜できそうです」「〜に見えます」を用いる | 「〜です」の断定より、提案であることが伝わる |

---

## 4. Advisor 出力テンプレート

### 4.1 役割の一言

**Advisor** は「ある Node について、次の一手・選択肢・判断基準・リスクを複数案で出す」エージェント。  
**案を出すが、選ばない**。必ず 2 つ以上の選択肢を出し、「おすすめ」や単一の「正解」は出さない。

### 4.2 AdvisorReport の形（JSON）

```json
{
  "target_node_id": "string",
  "target_title": "string",
  "current_status": "string",
  "options": [
    {
      "label": "string（案の短い名前。例: 案A：即決する）",
      "description": "string（案の詳細説明）",
      "pros": ["string"],
      "cons": ["string"],
      "next_action": "string（この案を選んだ場合の次の一手。必須）",
      "necessary_info": "string（この案を選ぶ前に知っておくといい情報。必須）",
      "criteria_note": "string（この案を選ぶときの判断基準。必須）",
      "risks": ["string"]（この案のリスク。必須、0件は不可）
    }
  ],
  "criteria": [
    {
      "name": "string（観点名。例: 緊急度）",
      "description": "string（この観点が重要な理由）"
    }
  ],
  "next_decision": "string（今、まず何を決めると他が見えてくるか。1 つ）",
  "summary": "string（状況整理。断定ではなく「〜に見えます」）"
}
```

**実務化のため**、各 `options` 要素に以下を **必須** とする。

- **next_action**: この案を選んだ場合の「次の一手」（何をすればいいか）
- **necessary_info**: この案を選ぶ前に知っておくといい情報
- **criteria_note**: この案を選ぶときの判断基準（何を重視するとこの案が合うか）
- **risks**: この案のリスク（配列、0 件は不可。最低 1 件）

### 4.3 Advisor：Must（最低品質ライン）

| 項目 | 条件 | 補足 |
|------|------|------|
| **選択肢が 2 つ以上** | `options` の長さ ≥ 2 | 単一案は「AI が決めた」と同義になるため禁止（22 §5.3） |
| **各 option に next_action / necessary_info / criteria_note / risks** | 各要素が存在し、`risks` は 1 件以上 | 実務で「そのまま実行できる」ために必須 |
| **target が入力に存在** | `target_node_id` が入力の Node のいずれかと一致 | 存在しない Node への提案は使えない |
| **断定・おすすめ禁止** | 「〜すべき」「ベスト」「推奨」「正解」を含まない | Advisor は選ばない（22 §5.4） |
| **next_decision が 1 文** | 「まず◯◯を決めると、他が見えてきます」の形で 1 つ | 判断の入口を明確にする |
| **summary が存在** | `summary` が空でない | 状況が分からないと案の意味が伝わらない |

### 4.4 Advisor：Should（高品質）

| 項目 | 条件 | 補足 |
|------|------|------|
| **criteria が 2 つ以上** | `criteria` の長さ ≥ 2 | 1 軸だけだと比較しづらい |
| **option の label に「案」等** | 各 option の `label` に「案」「パターン」「候補」のいずれかを含む | 案であることが一目で分かる（22 §5.4） |
| **pros/cons が具体的** | 抽象的な「メリットがある」ではなく、何がメリットかが分かる | 判断材料として使える |
| **語調が比較・選択を促す** | 「〜と〜を比較できます」「どれを選ぶかは〜次第です」 | 判断の主導権が人間にあることが伝わる |

---

## 5. 典型的な失敗例（ありがちなダメ提案）と防ぐチェックリスト

### 5.1 失敗例一覧

| # | パターン | 具体例 | 何がダメか |
|---|----------|--------|------------|
| 1 | **抽象論だけで終わる** | 「優先度を考えて整理すると良いでしょう」だけ | 次の一手が分からない。どの Node をどうするか書いていない。 |
| 2 | **ID が無い / 嘘** | 「この大きなタスクを分解して」とだけ書く。node_id が無い。 | そのまま実行できない。どの Node か特定できない。 |
| 3 | **理由（reason）が無い** | grouping_proposals に「A, B, C をグループに」とだけ。reason が空。 | なぜそのグループか分からず、判断できない。 |
| 4 | **単一案しか出さない（Advisor）** | options が 1 件だけ「やる」 | AI が答えを決めたように見える。比較できない。 |
| 5 | **リスクが書いていない（Advisor）** | 各 option に risks が無い or 空配列 | 選んだあとのデメリットが分からず、実務で使えない。 |
| 6 | **次の一手が無い（Advisor）** | option に next_action が無い。「案A：頑張る」で終わり | 選んでも何をすればいいか分からない。 |
| 7 | **断定・おすすめ** | 「これがベストです」「推奨：案A」 | Advisor は選ばない設計。判断の主導権が AI に移る。 |
| 8 | **分解が 1 子だけ** | suggested_children が 1 件だけ | 「分解」ではなく「そのまま」に近い。意味がない。 |
| 9 | **存在しない Node を参照** | from_node_id が入力に無い ID | 実行時にエラーになる。使えない。 |
| 10 | **要約だけ** | summary だけで、proposals が空 or 曖昧 | 情報が少なすぎて、何をすればいいか分からない。 |

### 5.2 防ぐチェックリスト（実装・レビュー用）

**Organizer**

- [ ] すべての node_id / target_node_id / from_node_id / to_node_id が入力の Node 一覧に存在するか
- [ ] すべての proposal に `reason` が 1 文以上あるか
- [ ] decomposition の `suggested_children` は 2 件以上か
- [ ] 「〜べき」「〜してください」「〜が必要です」が含まれていないか
- [ ] `summary` が空でないか

**Advisor**

- [ ] `options` が 2 件以上か
- [ ] 各 option に `next_action` / `necessary_info` / `criteria_note` / `risks`（1 件以上）があるか
- [ ] `target_node_id` が入力に存在するか
- [ ] 「ベスト」「推奨」「正解」「〜すべき」が含まれていないか
- [ ] `next_decision` が 1 文で「まず◯◯を決める」の形か
- [ ] `summary` が空でないか

---

## 6. 開発者向け：サンプル入力と期待される出力の形（自動テスト用）

以下は **入力の要約** と **期待される出力の形（JSON スキーマ・必須フィールド）** である。  
実際の自動テストでは、入力として「Node 一覧 + ObserverReport 等」を渡し、出力がスキーマと Must を満たすかを検証する。

### 6.1 用語とスキーマの約束

- **必須（required）**: このキーが無い、または条件を満たさない場合は不合格。
- **型**: `string` / `array` / `object` は JSON の型。`string (non-empty)` は空文字不可。

### 6.2 Organizer サンプル（5 件）

| # | 入力の概要 | 期待される出力の形（必須のみ） |
|---|------------|------------------------------|
| **O1** | アクティブ Node が 0 件 | `{ "decomposition_proposals": [], "grouping_proposals": [], "relation_proposals": [], "summary": "string (non-empty, 例: 机の上に Node がありません)" }` |
| **O2** | アクティブ Node が 1 件（タイトル「企画書を書く」、id: n1） | `summary` が存在。他は空配列でも可。`decomposition_proposals` を出す場合は `target_node_id: "n1"`, `reason` 非空, `suggested_children` 長さ ≥ 2。 |
| **O3** | 同一トピックに見える Node が 3 件（n1, n2, n3） | `grouping_proposals` の少なくとも 1 要素で `node_ids` に n1,n2,n3 のいずれかが含まれる。`reason` 非空。`summary` 非空。 |
| **O4** | 大きな Node 1 件（n1）を分解したい指示 | `decomposition_proposals` の 1 要素が `target_node_id: "n1"`, `suggested_children` 長さ ≥ 2, 各 child に `title`, `context`。`reason` 非空。 |
| **O5** | n1 が n2 に依存しそうな 2 件 | `relation_proposals` の 1 要素が `from_node_id`, `to_node_id`, `relation_type`, `reason` を持つ。ID は入力に存在するもの。 |

### 6.3 Advisor サンプル（5 件）

| # | 入力の概要 | 期待される出力の形（必須のみ） |
|---|------------|------------------------------|
| **A1** | NEEDS_DECISION の Node 1 件（id: n1、タイトル「承認待ちの見積もり」） | `target_node_id: "n1"`, `options` 長さ ≥ 2。各 option に `next_action`, `necessary_info`, `criteria_note`, `risks`（長さ ≥ 1）。`next_decision` 非空。`summary` 非空。 |
| **A2** | 同じく n1。遷移候補は READY / DONE / CANCELLED | 各 option に `suggested_status` があってもよい。`options` は 2 以上。必須 4 項目（next_action, necessary_info, criteria_note, risks）すべて満たす。 |
| **A3** | 下書き文案を求めたい Node（n1） | `options` が 2 つ以上の「案」（文案パターン）。各 option に description と risks。next_action は「この文案を使う場合の次の手順」でよい。 |
| **A4** | Node が 0 件 | エラーまたは「対象 Node がありません」の旨の summary のみの報告。`target_node_id` が無い場合は options は空でよい。 |
| **A5** | 複数 Node から 1 つを選んで「どうする？」（n1 を指定） | `target_node_id: "n1"`。`criteria` が 2 つ以上あると Should を満たす。必須 4 項目はすべて満たす。 |

### 6.4 JSON スキーマ例（OrganizerReport Must）

```json
{
  "type": "object",
  "required": ["decomposition_proposals", "grouping_proposals", "relation_proposals", "summary"],
  "properties": {
    "decomposition_proposals": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["target_node_id", "target_title", "reason", "suggested_children"],
        "properties": {
          "target_node_id": { "type": "string", "minLength": 1 },
          "target_title": { "type": "string" },
          "reason": { "type": "string", "minLength": 1 },
          "suggested_children": {
            "type": "array",
            "minItems": 2,
            "items": {
              "type": "object",
              "required": ["title", "context"],
              "properties": {
                "title": { "type": "string" },
                "context": { "type": "string" },
                "suggested_status": { "type": "string" }
              }
            }
          }
        }
      }
    },
    "grouping_proposals": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["group_label", "reason", "node_ids"],
        "properties": {
          "group_label": { "type": "string" },
          "reason": { "type": "string", "minLength": 1 },
          "node_ids": { "type": "array", "items": { "type": "string" } }
        }
      }
    },
    "relation_proposals": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["from_node_id", "to_node_id", "relation_type", "reason"],
        "properties": {
          "from_node_id": { "type": "string" },
          "to_node_id": { "type": "string" },
          "relation_type": { "type": "string" },
          "reason": { "type": "string", "minLength": 1 }
        }
      }
    },
    "summary": { "type": "string", "minLength": 1 }
  }
}
```

### 6.5 JSON スキーマ例（AdvisorReport Must）

```json
{
  "type": "object",
  "required": ["target_node_id", "target_title", "current_status", "options", "next_decision", "summary"],
  "properties": {
    "target_node_id": { "type": "string", "minLength": 1 },
    "target_title": { "type": "string" },
    "current_status": { "type": "string" },
    "options": {
      "type": "array",
      "minItems": 2,
      "items": {
        "type": "object",
        "required": ["label", "description", "next_action", "necessary_info", "criteria_note", "risks"],
        "properties": {
          "label": { "type": "string", "minLength": 1 },
          "description": { "type": "string" },
          "pros": { "type": "array", "items": { "type": "string" } },
          "cons": { "type": "array", "items": { "type": "string" } },
          "next_action": { "type": "string", "minLength": 1 },
          "necessary_info": { "type": "string", "minLength": 1 },
          "criteria_note": { "type": "string", "minLength": 1 },
          "risks": {
            "type": "array",
            "minItems": 1,
            "items": { "type": "string" }
          },
          "suggested_status": { "type": "string" }
        }
      }
    },
    "criteria": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "description"],
        "properties": {
          "name": { "type": "string" },
          "description": { "type": "string" }
        }
      }
    },
    "next_decision": { "type": "string", "minLength": 1 },
    "summary": { "type": "string", "minLength": 1 }
  }
}
```

---

## 7. 参照

- **21_SubAgent_Organizer.md** — Organizer の役割・出力型
- **22_SubAgent_Advisor.md** — Advisor の役割・複数案必須・語調ルール
- **20_SubAgent_Catalog.md** — Level 1 / Level 2 の定義
