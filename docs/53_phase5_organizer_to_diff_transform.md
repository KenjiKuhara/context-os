# 53 — Phase 5-A OrganizerReport → Diff 変換（Transform）仕様

OrganizerReport から Diff の配列（Diff[]）を生成するための **変換ルール** を確定する。実装で迷わないよう、入力→出力の対応を具体例付きで示す。

**前提**: 40_proposal_quality.md（OrganizerReport の Must/Should）、51_phase5_diff_schema.md（Diff スキーマ）、52_phase5_diff_validator.md（VALID/INVALID/NEEDS_REVIEW ルール）。

---

## 1. 変換の役割（Why）

### なぜ Transform を独立させるのか（LLM 出力をそのまま Apply しない思想）

- **OrganizerReport** は LLM が返す「提案の塊」である。そのまま Apply に渡すと、「どの 1 件を採用するか」が曖昧になり、部分採用や監査ができない（50・51 で述べた通り）。
- **Transform** は、この塊を **「1 件ずつ選んで Apply できる最小単位」＝ Diff** に分解する役割を持つ。Transform を独立させることで、
  - **「1 proposal = 1 Diff」** というルールを一箇所にまとめられる。
  - OrganizerReport のフィールド名（target_node_id, suggested_children 等）と、Diff のフィールド名（change.add_children 等）の **対応を仕様として固定** できる。
  - 実装時に「どこで Diff を組み立てるか」が明確になり、LLM 出力をそのまま Apply に渡すことがなくなる。

### Transform と Validator の責務分離

| 責務 | Transform | Validator（52） |
|------|-----------|-----------------|
| **やること** | OrganizerReport の各 proposal を **Diff の形に写す**。フィールドの対応と、**事前フィルタ**（明らかに作れない proposal は Diff にしない）を行う。 | できあがった **Diff 1 件** が、スキーマを満たすか・既存データと衝突しないかを **検証** する。VALID / INVALID / NEEDS_REVIEW を返す。 |
| **入力** | OrganizerReport + コンテキスト（run_id, validNodeIds 等）。 | Diff 1 件 + コンテキスト（validNodeIds, 既存 relations 等）。 |
| **出力** | Diff[] + 変換時の warnings（任意）。 | 判定結果 + errors + warnings。 |
| **重複** | 「存在しない Node を参照する proposal は Diff を作らない」など、**変換時点で落とす最低ライン** を設ける。 | 同じようなチェックを **Diff に対して** もう一度かける。Transform で落としきれなかった不正な Diff を Validator が弾く。重複してよい。 |

---

## 2. 入力と出力（I/O）

### Input

- **report**：OrganizerReport（40 の形）。decomposition_proposals / grouping_proposals / relation_proposals / summary を持つ。
- **organizer_run_id**：この Organizer 実行を一意に指す ID。必須。UUID や run のタイムスタンプ＋識別子など。
- **attempt_id**（任意）：同じ run 内で再生成した場合の試行番号。無ければ 0 または省略。
- **validNodeIds**：その時点で「存在する」Node の ID の配列。dashboard の trays を flatten した id のリストなど。**事前フィルタ** で「参照先が全部 valid か」を見るために使う。
- **既存 relations**（任意）：既に DB にある relation の一覧。Transform では必須ではないが、渡されていれば「重複 proposal を変換しない」などのフィルタに使える。無ければ Validator 側で重複チェックする。
- **親の子の有無**（任意）：各 Node が既に子を持つかどうか。Transform では必須ではない。NEEDS_REVIEW の判定は Validator に任せてもよい。

### Output

- **diffs**：Diff の配列。51 のスキーマに準拠したオブジェクトのリスト。**1 proposal = 1 Diff** で、事前フィルタで落とした proposal は含まない。
- **warnings**（任意）：変換時に「この proposal はスキップした」「このフィールドが無かったので既定値を使った」などの注意メッセージの配列。UI やログに出す用。

---

## 3. 変換ルール（proposal 種別 → Diff type）

### 3.1 decomposition_proposals[] → decomposition Diff

- **ルール**：配列の **1 要素 = 1 つの Diff**。type は `"decomposition"`。
- **target_node_id**：その proposal の **target_node_id** をそのまま使う（＝親 Node の ID）。
- **change**：
  - `parent_node_id` = proposal.target_node_id
  - `add_children` = proposal.suggested_children を、各要素を `{ title, context, suggested_status? }`（および任意で temp_id）の形に写す。
- **reason**：proposal.reason をそのまま。
- **risk**：Organizer の proposal には risk フィールドは無いので、変換では **付けない**（null または省略）。必要なら LLM プロンプト側で risk を出させる拡張は別途。

### 3.2 relation_proposals[] → relation Diff

- **ルール**：配列の **1 要素 = 1 つの Diff**。type は `"relation"`。Phase5-A では **add のみ**。
- **target_node_id**：**from_node_id** を使う（51 の「主対象を元側とする」に合わせる）。
- **change**：
  - `action` = `"add"`
  - `from_node_id` = proposal.from_node_id
  - `to_node_id` = proposal.to_node_id
  - `relation_type` = proposal.relation_type
- **reason**：proposal.reason をそのまま。

### 3.3 grouping_proposals[] → grouping Diff

- **ルール**：配列の **1 要素 = 1 つの Diff**。type は `"grouping"`。
- **target_node_id**：**node_ids の先頭**（node_ids[0]）を使う。51 の「代表として 1 つの Node を指す」に合わせる。node_ids が空の場合は事前フィルタで弾く。
- **change**：
  - `group_label` = proposal.group_label
  - `node_ids` = proposal.node_ids をそのまま（配列のコピー）。
- **reason**：proposal.reason をそのまま。

### まとめ（target_node_id の決め方）

| proposal 種別 | target_node_id の取り元 |
|---------------|-------------------------|
| decomposition | proposal.target_node_id（＝親） |
| relation | proposal.from_node_id |
| grouping | proposal.node_ids[0]（代表） |

---

## 4. フィールド埋めの規則（必須）

### diff_id

- **生成方針**：**UUID v4** を 1 Diff につき 1 つ生成する。run 内で一意にすればよい。同じ run から複数 Diff ができるため、run_id + 連番 でもよいが、Phase5-A では **UUID v4** に固定する。
- **一意性**：同じ run 内で同じ diff_id が 2 回出ないようにする。UUID v4 なら通常は衝突しない。

### generated_from

- **organizer_run_id**：入力で渡された organizer_run_id をそのまま入れる。必須。
- **attempt_id**：入力で渡された attempt_id があれば入れる。無ければ 0 または省略。
- **source_proposal**：どの配列の何番目かを文字列で入れる。例：`"decomposition_proposals[0]"`、`"relation_proposals[1]"`。デバッグ・トレース用。任意だが入れておくと便利。

### reason / risk

- **reason**：各 proposal の **reason** をそのまま Diff の reason にする。OrganizerReport の Must で「reason が空でない」ことになっているが、Transform の事前フィルタで reason が空の proposal は Diff にしない（§5）。
- **risk**：OrganizerReport の proposal には risk フィールドがないため、変換では **設定しない**（null または省略）。将来 LLM が risk を返すようにした場合は、その値を入れる。

### created_at

- **方針**：**付ける**。変換した時点の日時を ISO 8601 文字列（例：`new Date().toISOString()`）で入れ、ログや表示の並び順に使う。51 では任意だが、Transform の出力では常に付けておく。

---

## 5. 変換時点で「作らない」ケース（事前フィルタ）

以下のいずれかに当てはまる proposal は **Diff を生成しない**。その proposal はスキップし、warnings に「スキップした理由」を追加してもよい。52 の Validator と重複してもよい。「Transform で落とすべき最低ライン」として明確にする。

| ケース | 理由 |
|--------|------|
| **validNodeIds に存在しない Node を参照している** | decomposition の target_node_id、relation の from/to、grouping の node_ids のいずれかが validNodeIds に含まれていない。存在しない Node への Diff は Apply 時に必ず失敗するため、変換時点で作らない。 |
| **reason が無い、または空文字（トリム後）** | 51 で reason は必須かつ空禁止。満たさない proposal は Diff にしない。 |
| **decomposition：suggested_children が無い、または 2 件未満** | 40 の Must「分解案の children が 2 以上」。1 件以下は分解として成立しないので Diff にしない。 |
| **decomposition：子の title または context が空** | 52 でも INVALID。変換時点で「どれか 1 つでも空」ならその proposal は Diff にしない。 |
| **relation：from_node_id と to_node_id が同じ** | 52 で INVALID。自己参照は変換時点で弾く。 |
| **grouping：node_ids が無い、または 1 件以下** | 52 で「2 件以上」必須。1 件以下はグループとして成立しないので Diff にしない。 |

- 上記で **スキップした proposal の数** や **理由** を warnings に含めておくと、UI やログで「いくつ提案があったが、いくつは条件を満たさず表示していない」と説明できる。

---

## 6. 変換サンプル（最重要）

### 入力：OrganizerReport の最小サンプル（各 proposal を 1 つずつ含む）

```json
{
  "decomposition_proposals": [
    {
      "target_node_id": "node-parent",
      "target_title": "大きなタスク",
      "reason": "2 つに分けると進めやすいため。",
      "suggested_children": [
        { "title": "要件整理", "context": "やることの洗い出し", "suggested_status": "READY" },
        { "title": "実装", "context": "コーディング", "suggested_status": null }
      ]
    }
  ],
  "grouping_proposals": [
    {
      "group_label": "同じプロジェクト",
      "reason": "3 件とも同じプロジェクトのタスクに見えるため。",
      "node_ids": ["node-aaa", "node-bbb", "node-ccc"]
    }
  ],
  "relation_proposals": [
    {
      "from_node_id": "node-aaa",
      "to_node_id": "node-bbb",
      "relation_type": "depends_on",
      "reason": "A が終わらないと B に進めないため。"
    }
  ],
  "summary": "机の上を整理すると、1 つの分解・1 つのグループ・1 本の依存関係が提案されています。"
}
```

### 出力：生成される Diff[]（各 type 1 件以上）

※ diff_id は UUID v4 の例として固定文字列で示す。実際は run ごとに新規生成。

```json
[
  {
    "diff_id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
    "type": "decomposition",
    "target_node_id": "node-parent",
    "change": {
      "parent_node_id": "node-parent",
      "add_children": [
        { "title": "要件整理", "context": "やることの洗い出し", "suggested_status": "READY" },
        { "title": "実装", "context": "コーディング", "suggested_status": null }
      ]
    },
    "reason": "2 つに分けると進めやすいため。",
    "risk": null,
    "generated_from": {
      "organizer_run_id": "run-2025-02-08-001",
      "attempt_id": 0,
      "source_proposal": "decomposition_proposals[0]"
    },
    "created_at": "2025-02-08T12:00:00.000Z"
  },
  {
    "diff_id": "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
    "type": "grouping",
    "target_node_id": "node-aaa",
    "change": {
      "group_label": "同じプロジェクト",
      "node_ids": ["node-aaa", "node-bbb", "node-ccc"]
    },
    "reason": "3 件とも同じプロジェクトのタスクに見えるため。",
    "risk": null,
    "generated_from": {
      "organizer_run_id": "run-2025-02-08-001",
      "attempt_id": 0,
      "source_proposal": "grouping_proposals[0]"
    },
    "created_at": "2025-02-08T12:00:00.000Z"
  },
  {
    "diff_id": "c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f",
    "type": "relation",
    "target_node_id": "node-aaa",
    "change": {
      "action": "add",
      "from_node_id": "node-aaa",
      "to_node_id": "node-bbb",
      "relation_type": "depends_on"
    },
    "reason": "A が終わらないと B に進めないため。",
    "risk": null,
    "generated_from": {
      "organizer_run_id": "run-2025-02-08-001",
      "attempt_id": 0,
      "source_proposal": "relation_proposals[0]"
    },
    "created_at": "2025-02-08T12:00:00.000Z"
  }
]
```

- 並び順：**decomposition → grouping → relation** の順で配列に詰める、と決めておくと再現しやすい。仕様で固定してよい。

---

## 7. 実装メモ（疑似コード）

Transform の流れと、**どこで Validator を呼ぶか** を疑似コードで示す。実装はまだ作らないが、処理の順序と責務を明確にする。

```text
関数 transformOrganizerReportToDiffs(report, context):
  context には organizer_run_id, attempt_id, validNodeIds が含まれる

  diffs = 空の配列
  warnings = 空の配列

  validSet = context.validNodeIds を Set にしたもの

  // 1) decomposition_proposals を走査
  for i, proposal in enumerate(report.decomposition_proposals):
    if proposal.target_node_id が validSet に無い: warnings に追加して continue
    if proposal.reason が無い or トリム後空: warnings に追加して continue
    if proposal.suggested_children が無い or 長さ < 2: warnings に追加して continue
    if いずれかの子の title または context が空: warnings に追加して continue
    diff = decomposition 用の Diff を組み立て（diff_id は UUID v4, target_node_id = proposal.target_node_id, change = { parent_node_id, add_children }, reason, generated_from, created_at）
    diffs.push(diff)

  // 2) grouping_proposals を走査
  for i, proposal in enumerate(report.grouping_proposals):
    if proposal.node_ids が無い or 長さ < 2: warnings に追加して continue
    if proposal.node_ids のどれかが validSet に無い: warnings に追加して continue
    if proposal.reason が無い or トリム後空: warnings に追加して continue
    diff = grouping 用の Diff を組み立て（target_node_id = proposal.node_ids[0], change = { group_label, node_ids }, ...）
    diffs.push(diff)

  // 3) relation_proposals を走査
  for i, proposal in enumerate(report.relation_proposals):
    if proposal.from_node_id または to_node_id が validSet に無い: warnings に追加して continue
    if proposal.from_node_id === proposal.to_node_id: warnings に追加して continue
    if proposal.reason が無い or トリム後空: warnings に追加して continue
    diff = relation 用の Diff を組み立て（action = "add", target_node_id = proposal.from_node_id, change = { action, from_node_id, to_node_id, relation_type }, ...）
    diffs.push(diff)

  return { diffs, warnings }
```

**Validator を呼ぶタイミング**

- **Transform の直後**、diffs を UI や Apply に渡す前に、**各 Diff に対して validateDiff(diff, context) を呼ぶ**。
- validateDiff が **INVALID** を返した Diff は、一覧から除く（または「表示しない」でフィルタする）。**VALID** と **NEEDS_REVIEW** の Diff だけを UI に渡す。
- 流れのイメージ：`report → transformOrganizerReportToDiffs → diffs[] → 各 diff を validateDiff でフィルタ → 残った diffs を UI に表示・Confirm 可能にする`。

---

この文書で、OrganizerReport → Diff[] の **変換ルール・フィールド埋め・事前フィルタ・サンプル・疑似コード** を固定した。実装時はこの仕様に従い、1 proposal = 1 diff を守る。
