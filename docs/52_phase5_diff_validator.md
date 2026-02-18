# 52 — Phase 5-A Diff Validator 仕様

Phase5-A における **Diff の事前検証ルール** の定義書。UI に表示してよい Diff／Apply に進めてよい Diff を判定する基準であり、Organizer → Diff → Apply の間に挟まる **安全ゲート** である。

**前提**: 51_phase5_diff_schema.md の定義に完全準拠する。本 doc は 51 のスキーマを満たす Diff に対して「通す／止める／注意付きで出す」を決める。

---

## 1. Diff Validator の役割（Why）

### なぜ Organizer 出力をそのまま UI / Apply に渡さないのか

- OrganizerReport から **Diff のリスト** に変換したあと、その Diff が **スキーマどおりか**「既存データと衝突しないか」「人間が判断するのに足りるか」をまだ確認していない。そのまま UI に出して Apply を許可すると、
  - **必須フィールドが欠けている Diff** が表示され、Apply 時にエラーになる。
  - **存在しない Node を参照する Diff**（例：削除済みの Node への relation）が適用され、DB エラーや不整合になる。
  - **既に同じ relation や grouping が存在する Diff** を二重に適用し、重複や混乱が起きる。
- **Diff Validator** は、こうした問題を **Apply の前** に機械的に弾き、「通してよい Diff」だけを UI に渡し、Confirm・Apply に進める資格があるかどうかを判定する。

### Phase 4（Advisor Validator）との考え方の共通点と違い

| 観点 | Phase 4：Advisor / Organizer Report Validator | Phase 5-A：Diff Validator |
|------|-----------------------------------------------|---------------------------|
| **共通点** | 「通す／通さない」の線を機械で引く。Must を満たさないものはそのまま使わない。判定結果で **errors** を返し、通さない理由を明示する。 | 同じ。**INVALID** なら UI に出さず破棄。**VALID** なら表示・Confirm 可能。 |
| **判定対象** | OrganizerReport / AdvisorReport という「1 つのレポート全体」。 | **Diff 1 件ずつ**。1 run から複数 Diff ができるので、**Diff 単体** で判定する。 |
| **入力** | report + validNodeIds（入力に存在する Node の ID 一覧）。 | 1 つの Diff + **コンテキスト**（validNodeIds、既存 relation 一覧、既存 grouping の有無、親が子を持つかどうか等）。 |
| **自動修正** | Phase 4 では errors を AI に返して **再生成** させる（自己修正ループ）。 | Phase5-A では **自動修正はしない**。弾くか、**NEEDS_REVIEW** として注意を付けて出すだけ。 |

---

## 2. 判定結果の種類

Validator の出力は、次の **3 種類のいずれか 1 つ** とする。enum として固定する。

| 判定結果 | 意味 | UI / Apply での扱い |
|----------|------|----------------------|
| **VALID** | この Diff はスキーマを満たし、既存データとの衝突もなく、そのまま表示・Confirm・Apply してよい。 | 一覧に表示し、「この案で反映する」で Confirm → Apply 可能。 |
| **INVALID** | この Diff は仕様違反または事故の可能性が高く、**表示も Apply もさせない**。 | UI には出さず破棄する。理由（errors）をログやデバッグ用に残す。 |
| **NEEDS_REVIEW** | スキーマは満たすが、**注意すべき点** がある。人間の判断に委ねる。 | UI には出すが、「注意」や「要確認」の表示を付ける。Apply は可能だが、確認を促す。 |

- **VALID** と **NEEDS_REVIEW** の Diff は一覧に表示してよい。**INVALID** の Diff は一覧に含めず、Apply の対象にしない。
- 判定結果に加え、**errors**（INVALID の理由のリスト）と **warnings**（NEEDS_REVIEW の理由のリスト）を返す。実装では `{ result: "VALID" | "INVALID" | "NEEDS_REVIEW", errors: string[], warnings: string[] }` のような形を想定する。

---

## 3. 共通バリデーション（全 type 共通）

すべての Diff に対して、**type の値を見る前に** 以下をチェックする。1 つでも違反すれば **INVALID** とする。

### 3.1 必須フィールドの欠落

- **ルール**：51 で必須とされているフィールドが、存在しない、または null/undefined であってはならない。
- **対象**：`diff_id`、`type`、`target_node_id`、`change`、`reason`、`generated_from`。
- **generated_from 内**：`organizer_run_id` が必須。欠けていれば INVALID。
- **違反時**：例「diff_id is required」「reason is required」のように、欠けているフィールド名を errors に含める。

### 3.2 target_node_id の存在チェック

- **ルール**：`target_node_id` は、**その時点で入力（dashboard / trays）に存在する Node の ID** の一覧に含まれていなければならない。
- **入力**：Validator には「現在有効な Node の ID 一覧」（validNodeIds）を渡す。51 の「存在しない Node を参照すると不整合になる」を防ぐため。
- **違反時**：例「target_node_id is not in valid node list」で INVALID。

### 3.3 diff_id の形式

- **ルール**：`diff_id` は空文字であってはならない。また、**同一 run 内で他の Diff と重複** していてはならない（§3.5）。
- **形式**：UUID であればその形式（例：8-4-4-4-12 の 16 進）を満たすこと。UUID でない場合も「空でない・トリム後 1 文字以上」を必須とする。
- **違反時**：空または形式不正なら「diff_id must be a non-empty unique identifier」で INVALID。

### 3.4 reason が空でないこと

- **ルール**：`reason` は文字列であり、**トリムしたあと 1 文字以上** でなければならない。51 で「空文字は禁止」とされている。
- **違反時**：「reason must be a non-empty string」で INVALID。

### 3.5 同一 run 内での重複 Diff 検出

- **ルール**：同じ **organizer_run_id** の Diff のリストを検証するとき、**同じ diff_id が 2 回以上現れてはならない**。1 run から生成された Diff のリストの中で、diff_id は一意であること。
- **違反時**：2 件目以降の重複は INVALID。例「duplicate diff_id in same run」。

---

## 4. type 別バリデーション

共通バリデーションを通過したうえで、**type の値に応じて** 追加のルールを適用する。違反があれば INVALID または NEEDS_REVIEW とする。

### 4.1 relation_diff（type が `"relation"` のとき）

- **change の必須**：`change` はオブジェクトであり、`action` / `from_node_id` / `to_node_id` / `relation_type` が存在すること。Phase5-A で `action === "add"` のみ扱う場合、add に必要な 3 つ（from_node_id, to_node_id, relation_type）が揃っていること。欠けていれば INVALID。
- **from / to が同一でないこと**：`from_node_id` と `to_node_id` は **同じ ID であってはならない**。自分自身への relation は意味が曖昧で事故のもとになるため、禁止する。違反なら INVALID（例：「from_node_id and to_node_id must be different」）。
- **from / to の存在チェック**：`from_node_id` と `to_node_id` の両方が、**validNodeIds に含まれる** こと。どちらかが存在しない Node なら INVALID。
- **既存 relation の重複チェック**：**同じ (from_node_id, to_node_id, relation_type) の relation が、既に DB（または渡された既存 relation 一覧）に存在する場合は INVALID**。二重に張ると重複データになるため。入力として「既存の relation のリスト」を渡し、同じ 3 つ組が含まれていれば「relation already exists」で INVALID。

### 4.2 grouping_diff（type が `"grouping"` のとき）

- **change の必須**：`change` はオブジェクトであり、`group_label` と `node_ids` が存在すること。`node_ids` は配列であること。欠けていれば INVALID。
- **node_ids が 2 件以上**：`node_ids` の長さは **2 以上** でなければならない。1 件だけの「グループ」は意味が薄く、51 の「2 件以上を想定」に合わせる。違反なら INVALID（例：「node_ids must contain at least 2 nodes」）。
- **node_ids の要素の存在チェック**：`node_ids` のすべての要素が **validNodeIds に含まれる** こと。1 つでも存在しない ID があれば INVALID。
- **同じ grouping が既に存在しないか**：実装方針によるが、**同じ group_label で同じ node_ids のグループが既に存在する場合** は、重複なので INVALID とするか、NEEDS_REVIEW（「同じグループが既にあります」）とする。Phase5-A では「重複は INVALID」として、二重登録を防いでもよい。

### 4.3 decomposition_diff（type が `"decomposition"` のとき）

- **change の必須**：`change` はオブジェクトであり、`parent_node_id` と `add_children` が存在すること。`add_children` は配列であること。欠けていれば INVALID。
- **add_children が 1 件以上**：`add_children` の長さは **1 以上**（51 では「2 件以上に分ける」が分解の意味、と 40 にあるが、Diff 的には「1 件以上の子を追加」を許すか、**2 件以上** を必須にするかは設計で決める）。ここでは **2 件以上** を必須とする。1 件だけの「分解」は意図が曖昧なため、INVALID（例：「add_children must contain at least 2 items for decomposition」）。
- **各子の title / context が空でないこと**：`add_children` の各要素について、`title` と `context` が存在し、**トリムしたあと 1 文字以上** であること。空の子 Node は作らせない。違反なら INVALID。
- **parent_node_id の存在チェック**：`parent_node_id` が **validNodeIds に含まれる** こと。また、`target_node_id` と `parent_node_id` は **一致している** こと。一致していなければ INVALID。
- **親 Node が leaf でなくてもよいか**：親が **既に子を持っている** 場合、さらに子を追加することは「分解」ではなく「追加」になる。Phase5-A では **「親が既に子を持つ場合は NEEDS_REVIEW」** とする。UI で「この Node は既に子があります。追加で子を増やしますか？」と注意表示する。既に子がいない場合のみ VALID のままとする、というルールでもよい。どちらにするかは product 判断で、ここでは「既に子がいる親への decomposition は NEEDS_REVIEW」とする。

---

## 5. INVALID にするケース（例示）

以下のような Diff は **即 INVALID** とし、UI に出さず破棄する。なぜ捨てるかは事故防止の観点で明示する。

| ケース | 理由（事故防止の観点） |
|--------|------------------------|
| **必須フィールドが 1 つでも欠けている** | Apply 時にどの API に何を渡すか決まらず、エラーになるか誤った対象に適用される。 |
| **target_node_id が validNodeIds に無い** | 削除済みや存在しない Node に反映しようとして DB エラーになる。 |
| **reason が空** | 人間が「なぜこの変更か」を判断できず、誤って OK しやすい。 |
| **relation で from と to が同じ** | 自己参照は意味が曖昧で、後のクエリや表示で混乱する。 |
| **relation で既に同じ (from, to, type) が存在する** | 二重に張ると重複データになり、整合性が崩れる。 |
| **grouping で node_ids が 1 件だけ** | グループの意味をなさず、無意味なデータが増える。 |
| **grouping で node_ids に存在しない ID が含まれる** | 存在しない Node をグループに含めると参照整合性が崩れる。 |
| **decomposition で add_children が 0 件または 1 件** | 「分解」として成立せず、空の変更か 1 子追加だけになり意図が曖昧。 |
| **decomposition で子の title や context が空** | 中身のない Node が増え、机が散らかる。 |
| **同一 run 内で diff_id が重複** | どの Diff を適用したか追えず、二重適用の検出もできない。 |

---

## 6. NEEDS_REVIEW にするケース（例示）

以下のような Diff は **スキーマは満たすが、注意が必要** として **NEEDS_REVIEW** とする。UI には出すが、「注意」として表示し、人間の判断に委ねる。

| ケース | UI で「注意」として表示すべき理由 |
|--------|----------------------------------|
| **decomposition で、親 Node が既に子を持っている** | 「分解」ではなく「子の追加」になる。意図どおりかどうか、人間が確認したほうがよい。 |
| **grouping で、同じ group_label でほぼ同じ node_ids のグループが既にある** | 重複に近いが、完全一致でない場合は「似たグループが既にあります」と注意を出し、人間に任せる。 |
| **relation で、逆方向の relation（to→from）が既に存在する** | 双方向の関係になる。意図的かどうか人間が確認したほうがよい。 |
| **add_children の件数が非常に多い（例：10 件以上）** | 一括で子が増え、机が一気に散らかる。本当に全部必要か、人間に確認を促す。 |

- NEEDS_REVIEW の Diff も **Apply は許可** する。表示上「要確認」や「注意」を付け、Confirm 時に短い注意文を出すなどして、判断材料を渡す。

---

## 7. Phase5-A の制約

以下を Diff Validator の仕様として固定する。

- **Validator は「Diff 単体」で判定する**：1 つの Diff を受け取り、その 1 件について VALID / INVALID / NEEDS_REVIEW を返す。**複数の Diff をまとめて**「この組み合わせなら OK」のような判定はしない。
- **複数 Diff 間の最適化・整合性チェックは行わない**：「Diff A と Diff B を両方適用すると矛盾する」といった **Diff 同士の関係** は見ない。Phase5-A では 1 Diff = 1 Apply であり、複数 Diff の同時適用はしない前提のため、相互整合性の検証はスコープ外とする。
- **自動修正はしない**：不足フィールドを補ったり、node_ids を並び替えたりしない。**弾く（INVALID）か、注意を付けて出す（NEEDS_REVIEW）だけ**。修正は人間が Organizer の入力を変えるか、別 run で再生成するかで行う。

---

この文書で、**何を VALID／INVALID／NEEDS_REVIEW とするか** をルールとして固定した。実装時はこの仕様に従い、if 文を散らさず「ルールの一覧」として実装する。
