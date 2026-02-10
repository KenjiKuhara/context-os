# 51 — Phase 5-A Diff スキーマ仕様

Organizer Apply における **Diff（変更提案）** の厳密な定義書。UI・API・validator・confirmations の共通前提となる仕様であり、実装前に合意しておく「境界」を決めるためのドキュメントである。

**前提**: 50_phase5_organizer_apply_overview.md、40_proposal_quality.md（OrganizerReport）。

---

## 1. Diff とは何か（Why）

### なぜ OrganizerReport をそのまま Apply しないのか

- **OrganizerReport** は LLM が返す **提案の塊** である。中に「分解案が複数」「関連案が複数」「グループ案が複数」が一度に入っている。これを丸ごと DB に書くと、
  - **どの 1 つを採用したか** が分からず、部分採用ができない。
  - **監査** で「どの案がいつ反映されたか」を追いにくい。
  - **誤適用** したときに「どの案が悪かったか」の切り分けができない。
- そのため、OrganizerReport の各案を **「1 件の適用単位」** に分解した **Diff** を導入する。Diff は「これ 1 つを Apply する／しない」を人間が選べる最小単位である。

### Diff があることで防げる事故の種類

| 事故の種類 | Diff でどう防ぐか |
|------------|-------------------|
| **別の案が適用される** | 1 Diff に 1 つの変更内容だけを持たせ、diff_id で一意に指す。Confirm と Apply は「この diff_id の Diff だけ」を対象にする。 |
| **同じ案を二重に適用する** | diff_id を確認オブジェクトに含め、1 confirmation で 1 Diff だけを消費する。同じ diff_id の再適用は禁止する。 |
| **「どの案か」が後から分からなくなる** | generated_from で Organizer のどの実行・どの案から作られた Diff かを残す。監査・トレースができる。 |
| **部分採用ができない** | 案ごとに Diff に分けておくので、「この Diff だけ Apply」「あの Diff は Apply しない」を選べる。 |

---

## 2. Diff の基本構造（共通フィールド）

すべての Diff に共通するフィールドを定義する。**必須** と **任意** を明示する。

| フィールド | 必須／任意 | 説明 |
|------------|------------|------|
| **diff_id** | **必須** | この Diff を一意に識別する ID。生成規則は §5 で述べる。同じ diff_id の Diff を 2 回 Apply してはならない。 |
| **type** | **必須** | Diff の種類。**enum**：`"relation"` / `"grouping"` / `"decomposition"` のいずれか 1 つ。Phase5-A では status は扱わない。 |
| **target_node_id** | **必須** | 主に対象となる Node の ID。relation では「どちらか一方の代表」、grouping では「代表 Node やグループの識別に使う場合」、decomposition では **親 Node の ID**。 |
| **change** | **必須** | この Diff で「何をどう変えるか」。type ごとに構造が異なる。§3 で type 別に定義する。 |
| **reason** | **必須** | 人間向け。「なぜこの変更を提案するか」。Organizer の proposal の reason を引き継ぐ。空文字は禁止。 |
| **risk** | 任意 | 人間向け。「この変更で想定されるリスク」を一文で。無くてもよい。 |
| **generated_from** | **必須** | この Diff がどの Organizer 実行のどの案から作られたか。監査・トレース用。中身は §3 の直前に補足する。 |
| **created_at** | 任意 | Diff が生成された日時（ISO 8601 文字列など）。あればログ・表示の並び順に使える。 |

**generated_from の最小構成**

- **organizer_run_id**（必須）：どの Organizer 実行か。API の run ごとに一意な値（例：UUID や run のタイムスタンプ＋ユーザー識別）。
- **attempt_id**（任意）：同じ run 内で再生成した場合、何回目か。無ければ省略可。
- **source_proposal**（任意）：OrganizerReport のどの配列の何番目か。例：`"decomposition_proposals[0]"`。デバッグ・トレース用。

---

## 3. type 別の change 構造

`change` フィールドは **type の値に応じて形が変わる**。以下で 1 type につき 1 つ以上の JSON 例を示す。

### 3.1 relation_diff（type が `"relation"` のとき）

**意味**：2 つの Node の間に参照関係を **1 本** 追加する（または削除する）。Phase5-A では **add（追加）のみ** を扱い、remove はスコープ外としてもよい。

| フィールド | 必須／任意 | 説明 |
|------------|------------|------|
| **action** | **必須** | **enum**：`"add"` または `"remove"`。Phase5-A では `"add"` のみ実装してもよい。 |
| **from_node_id** | **必須**（add 時） | 関係の「元」側の Node ID。 |
| **to_node_id** | **必須**（add 時） | 関係の「先」側の Node ID。 |
| **relation_type** | **必須**（add 時） | 関係の種類。例：`"depends_on"` / `"related"` / `"same_topic"`。文字列 1 つ。 |

**target_node_id の扱い**：relation Diff では、`target_node_id` は `from_node_id` と一致させる（主対象を「元」側とする）か、必須のためどちらか一方を入れておく。

**JSON 例（relation / add）**

```json
{
  "diff_id": "550e8400-e29b-41d4-a716-446655440001",
  "type": "relation",
  "target_node_id": "node-aaa",
  "change": {
    "action": "add",
    "from_node_id": "node-aaa",
    "to_node_id": "node-bbb",
    "relation_type": "depends_on"
  },
  "reason": "A が終わらないと B に進めないため、依存関係を張る提案です。",
  "risk": null,
  "generated_from": {
    "organizer_run_id": "run-2025-02-08-001",
    "attempt_id": 0,
    "source_proposal": "relation_proposals[0]"
  }
}
```

---

### 3.2 grouping_diff（type が `"grouping"` のとき）

**意味**：複数 Node を 1 つのグループとして扱う。DB 上は「トレイ（tray）の移動」「タグ・ラベルの付与」など、実装方針に依存する。ここでは **from_group / to_group** または **tray_id** のような「どこからどこへ」を表す最小形を示す。

| フィールド | 必須／任意 | 説明 |
|------------|------------|------|
| **group_label** | **必須** | グループの名前（Organizer の group_label）。 |
| **node_ids** | **必須** | このグループに含める Node の ID の配列。2 件以上を想定。 |
| **from_tray** | 任意 | 変更前のトレイ（あれば）。Phase5-A で「移動」だけを扱う場合は from → to の形にする。 |
| **to_tray** | 任意 | 変更後のトレイ（あれば）。 |

**target_node_id の扱い**：grouping では「代表」として 1 つの Node を指す場合、node_ids の先頭などにしておく。必須フィールドを満たすため。

**JSON 例（grouping）**

```json
{
  "diff_id": "550e8400-e29b-41d4-a716-446655440002",
  "type": "grouping",
  "target_node_id": "node-aaa",
  "change": {
    "group_label": "同じプロジェクト",
    "node_ids": ["node-aaa", "node-bbb", "node-ccc"]
  },
  "reason": "3 件とも同じプロジェクトのタスクに見えるため、グループ化を提案します。",
  "risk": "別プロジェクトのものが混ざっている可能性があります。",
  "generated_from": {
    "organizer_run_id": "run-2025-02-08-001",
    "attempt_id": 0,
    "source_proposal": "grouping_proposals[0]"
  }
}
```

※ from_group / to_group で「移動」を表す場合は、change を `"from_group": null, "to_group": "同じプロジェクト"` のような形にしてもよい。実装方針で決める。

---

### 3.3 decomposition_diff（type が `"decomposition"` のとき）

**意味**：1 つの親 Node の下に、**子 Node を複数追加** する。Organizer の suggested_children を「追加する子」のリストとして持つ。

| フィールド | 必須／任意 | 説明 |
|------------|------------|------|
| **parent_node_id** | **必須** | 子を追加する親 Node の ID。共通の target_node_id と一致させる。 |
| **add_children** | **必須** | 追加する子のリスト。各要素は title / context / suggested_status（任意）を持つ。**仮 ID**（プレビュー用の一時識別子）を付けてもよい。 |

**add_children の各要素**

| フィールド | 必須／任意 | 説明 |
|------------|------------|------|
| **temp_id** | 任意 | プレビューや UI で「どの子か」を指すための仮 ID。Apply 時は DB が採番する本当の id が付く。 |
| **title** | **必須** | 子 Node のタイトル。 |
| **context** | **必須** | 子 Node の文脈・内容。 |
| **suggested_status** | 任意 | 初期 status の提案。無ければ READY など既定値を使う。 |

**JSON 例（decomposition）**

```json
{
  "diff_id": "550e8400-e29b-41d4-a716-446655440003",
  "type": "decomposition",
  "target_node_id": "node-parent",
  "change": {
    "parent_node_id": "node-parent",
    "add_children": [
      {
        "temp_id": "child-1",
        "title": "要件整理",
        "context": "やることの洗い出し",
        "suggested_status": "READY"
      },
      {
        "temp_id": "child-2",
        "title": "実装",
        "context": "コーディング",
        "suggested_status": null
      }
    ]
  },
  "reason": "大きなタスクを 2 つに分けると進めやすいため。",
  "risk": "分け方が適切でないと、後で統合が面倒になる可能性があります。",
  "generated_from": {
    "organizer_run_id": "run-2025-02-08-001",
    "attempt_id": 0,
    "source_proposal": "decomposition_proposals[0]"
  }
}
```

---

## 4. Diff として「扱わないもの」

以下は **Diff の対象にしない**。仕様で禁止とする。

| 扱わないもの | 理由（一言） |
|--------------|--------------|
| **status 変更** | 1 Node の status 変更は **Advisor の責務**。Advisor Apply と estimate-status で既に実現している。Organizer で status を扱うと責務が重なり、事故時の切り分けが難しくなる。 |
| **note 本文の自動変更** | Node の note を AI が書き換えると、人間のメモが上書きされるリスクが高い。Phase5-A では「構造の変更」に限定し、本文の編集は扱わない。 |
| **既存 Node の削除** | 削除は取り消しが効かず影響が大きい。Phase5-A では「追加」と「関係・グループの付与」に限定し、削除はスコープ外とする。 |
| **複数差分の同時最適化** | 「複数の Diff をシステムが自動で組み合わせて最適化して適用」は行わない。人間が 1 Diff ずつ選んで Confirm する形に限定する。 |

---

## 5. Diff の一意性と冪等性

### diff_id の役割

- **一意性**：1 つの Diff を **世界で 1 つ** に特定する。同じ Organizer 実行から複数の Diff ができるため、run_id だけでは足りず、**Diff ごとに一意な diff_id** が必要である。
- **生成規則**：diff_id は **UUID v4** とするか、または `organizer_run_id` + `type` + `source_proposal` などから決定的に生成する。いずれにせよ、**同じ Diff 内容には同じ diff_id が付く**（再現可能）か、**毎回新しい UUID**（実行ごとに必ず異なる）のどちらかに揃える。Phase5-A では「1 run から 1 回だけ Diff リストを生成する」前提なら、run 内で連番や proposal の index を組み合わせてもよい。

### 同じ Diff を 2 回 Apply してはいけない理由

- **冪等性**：同じ変更を 2 回適用すると、relation が重複して張られたり、子 Node が二重にできたりする。DB の整合性が崩れる。
- **防止方法**：1 つの **confirmation** を **1 回だけ消費** する。Apply 時に「この confirmation は既に consumed 済み」なら適用しない。さらに、**diff_id を「適用済み」として記録** し、同じ diff_id の Diff を再度 Apply しようとしたら拒否する、という二重ガードを推奨する。

### confirmations との関係

- confirmation オブジェクトの **proposed_change** に、少なくとも **diff_id** と **type**、および change の要約（from_node_id / to_node_id、parent_node_id、add_children の件数など）を入れる。
- Apply API は「この confirmation_id に紐づく **1 つの Diff**」だけを適用する。confirmation と Diff は **1 対 1** とする。1 confirmation で複数 Diff を適用することは Phase5-A では禁止する。

---

## 6. UI での表示前提

### プレビューで必ず表示すべき項目

- **対象**：どの Node（id または title）が対象か。relation の場合は from / to の両方。decomposition の場合は親 Node。grouping の場合は node_ids に対応する Node の一覧（または代表）。
- **何が変わるか**：適用後に「何が追加されるか」を短文または箇条書きで。例：「A と B の間に depends_on が 1 本追加されます」「子 Node が 2 件追加されます」。
- **reason**：この Diff の reason フィールドをそのまま表示する。人間が「なぜこの変更か」を判断するため。
- **risk**：risk フィールドがあれば表示する。無ければ「特になし」や表示省略でよい。

### 人間が判断するために必要な最小情報

- **どれがどれか分かること**：一覧で複数 Diff が出るとき、type と target_node_id（または対象の短いラベル）で「この行は relation」「この行は decomposition」と識別できること。
- **適用してよいか決められること**：上記「対象・何が変わるか・理由・リスク」が揃っていれば、人間は「この 1 件を Apply してよいか」を判断できる。これより少ないと判断材料が足りない。

---

## 7. Phase5-A における制約

以下を Phase5-A の仕様として固定する。

- **1 Diff = 1 Apply**：1 回の Apply で反映するのは **必ず 1 つの Diff** だけ。複数 Diff をまとめて 1 回で Apply する「一括適用」は **しない**。
- **一括適用はしない**：ユーザーが複数の Diff を選択して一度に Apply する機能は Phase5-A では提供しない。事故防止のため、まずは 1 件ずつの選択・Confirm・Apply に限定する。
- **Undo は扱わない**：適用した Diff を取り消す（Undo）機能は Phase5-A では定義しない。取り消しは Phase 6 以降で検討する。

---

この文書で、**何が Diff で何が Diff ではないか**、**共通フィールドと type 別の change**、**一意性・冪等性・confirmations との関係**、**UI 表示と Phase5-A の制約** を厳密に定義した。実装時はこの仕様を共通前提とし、API や validator の詳細は別 doc で定義する。
