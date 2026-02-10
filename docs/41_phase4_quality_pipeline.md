# 41 — Phase 4 品質パイプライン実装計画

## 0. この文書の目的

40_proposal_quality.md で定義した「提案の品質」を、**JSON → validator → 自己修正 → render** のパイプラインで保証する実装計画と、既存 API との接続方針を固定する。

**前提**: 40_proposal_quality.md（Must / Should・サンプル 10 件）、21_SubAgent_Organizer.md、22_SubAgent_Advisor.md。

---

## 1. パイプライン方針：JSON → validator → 自己修正 → render

Advisor / Organizer の出力を「使える提案」に保証するため、次の 4 段階で扱う。

```
[AI 出力] → JSON パース → Validator（Must / Should）→ 不足時は自己修正ループ → Render（UI 表示 or API ペイロード）
```

| 段階 | 役割 | 成果物 |
|------|------|--------|
| **JSON** | AI の生出力を JSON として受け取り、パースする。パース失敗時はここでエラー。 | パース済みオブジェクト（OrganizerReport / AdvisorReport） |
| **Validator** | 40 の Must を機械判定。違反があれば **errors** リストで返す。Should は **warnings** リストで返す。 | `{ ok: boolean, errors: string[], warnings: string[] }` |
| **自己修正** | errors が 1 件以上なら、errors の内容を AI への再生成プロンプトに渡す。最大 N 回（例: 2）までループ。 | 再生成した JSON を再度 Validator へ |
| **Render** | errors が 0 のときのみ、UI 表示または既存 API（estimate-status 等）へ渡す payload を生成。 | 表示用データ or API リクエスト用 payload |

**重要**: Validator は「人間の代わりに採点する」のではなく、**Must を満たさない出力はそのまま使わない**ためのゲートとする。自己修正は「AI に不足項目を伝え、再生成させる」役割であり、実装側は **errors をプロンプトに埋め込む** までを担当する。

---

## 2. 内部データ構造（TypeScript 型）

40 の JSON 形と一致する型を `src/lib/proposalQuality/types.ts` に定義する。API や validator はこの型を参照する。

### 2.1 OrganizerReport

```ts
// 40 §3.2 に対応
export interface OrganizerReportChild {
  title: string;
  context: string;
  suggested_status?: string;
}

export interface OrganizerDecompositionProposal {
  target_node_id: string;
  target_title: string;
  reason: string;
  suggested_children: OrganizerReportChild[];
}

export interface OrganizerGroupingProposal {
  group_label: string;
  reason: string;
  node_ids: string[];
}

export interface OrganizerRelationProposal {
  from_node_id: string;
  to_node_id: string;
  relation_type: string;
  reason: string;
}

export interface OrganizerReport {
  decomposition_proposals: OrganizerDecompositionProposal[];
  grouping_proposals: OrganizerGroupingProposal[];
  relation_proposals: OrganizerRelationProposal[];
  summary: string;
}
```

### 2.2 AdvisorReport

```ts
// 40 §4.2 に対応（必須 4 項目を含む）
export interface AdvisorOption {
  label: string;
  description?: string;
  pros?: string[];
  cons?: string[];
  next_action: string;
  necessary_info: string;
  criteria_note: string;
  risks: string[];
  suggested_status?: string;
}

export interface AdvisorCriterion {
  name: string;
  description: string;
}

export interface AdvisorReport {
  target_node_id: string;
  target_title: string;
  current_status: string;
  options: AdvisorOption[];
  criteria?: AdvisorCriterion[];
  next_decision: string;
  summary: string;
}
```

### 2.3 Validator 結果

```ts
export interface ValidationResult {
  ok: boolean;       // errors.length === 0
  errors: string[]; // Must 違反（1 件でもあれば ok === false）
  warnings: string[]; // Should 違反（情報のみ）
}
```

---

## 3. Validator のルール（Must のみ機械判定、Should は警告）

Validator は `src/lib/proposalQuality/validator.ts` に実装する。  
入力は「パース済みオブジェクト」と「検証に必要なコンテキスト（例: 入力に存在する node_id の一覧）」とする。

### 3.1 Organizer：Must（機械判定）

| ルール | 判定内容 | 違反時の error メッセージ例 |
|--------|----------|----------------------------|
| トップキー存在 | `decomposition_proposals`, `grouping_proposals`, `relation_proposals`, `summary` が存在 | `"summary is required"` |
| summary 非空 | `summary` が文字列で長さ ≥ 1 | `"summary must be non-empty"` |
| 全 ID が入力に存在 | すべての `target_node_id` / `from_node_id` / `to_node_id` / `node_ids` の各要素が、引数 `validNodeIds: string[]` に含まれる | `"target_node_id 'xyz' is not in valid node list"` |
| 各 proposal に reason 非空 | decomposition / grouping / relation の各要素で `reason` が存在し `reason.trim().length >= 1` | `"decomposition_proposals[0].reason is required and non-empty"` |
| 分解は 2 子以上 | `decomposition_proposals` の各要素で `suggested_children.length >= 2` | `"decomposition_proposals[0].suggested_children must have at least 2 items"` |
| 子に title / context | 各 `suggested_children` の要素に `title`, `context` が存在 | `"suggested_children[0].title is required"` |
| 断定語なし | `summary` および各 `reason` に「〜べき」「〜してください」「〜が必要です」を含まない（正規表現または文字列包含で検出） | `"summary or reason contains forbidden phrase (e.g. べき, してください)"` |

### 3.2 Organizer：Should（警告）

| ルール | 判定内容 | 違反時の warning メッセージ例 |
|--------|----------|------------------------------|
| 次の一手が分かる | summary に「まず」を含む等（簡易） | `"summary could suggest next step (e.g. まず◯◯)"` |
| ラベルが具体的 | `group_label` / `relation_type` が 2 文字以上 | 省略可（実装が重い場合は未実装でも可） |

### 3.3 Advisor：Must（機械判定）

| ルール | 判定内容 | 違反時の error メッセージ例 |
|--------|----------|----------------------------|
| トップキー存在 | `target_node_id`, `target_title`, `current_status`, `options`, `next_decision`, `summary` が存在 | `"options is required"` |
| options が 2 件以上 | `options.length >= 2` | `"options must have at least 2 items"` |
| 各 option に必須 4 項目 | 各要素に `next_action`, `necessary_info`, `criteria_note`, `risks` が存在し、`risks.length >= 1` | `"options[0].next_action is required"` |
| target が入力に存在 | `target_node_id` が引数 `validNodeIds` に含まれる（Node 0 件の場合は A4 の通り例外扱い可） | `"target_node_id is not in valid node list"` |
| next_decision / summary 非空 | それぞれ `trim().length >= 1` | `"next_decision must be non-empty"` |
| 断定・おすすめ禁止 | 全文から「ベスト」「推奨」「正解」「〜すべき」を含まない | `"output contains forbidden word (e.g. ベスト, 推奨)"` |

### 3.4 Advisor：Should（警告）

| ルール | 判定内容 | 違反時の warning メッセージ例 |
|--------|----------|------------------------------|
| criteria が 2 つ以上 | `criteria` が存在し `criteria.length >= 2` | `"criteria should have at least 2 items"` |
| label に「案」等 | 各 option の `label` に「案」「パターン」「候補」のいずれかを含む | `"options[0].label should contain 案/パターン/候補"` |

---

## 4. 自己修正ループ（不足項目があれば AI に再生成させるプロンプト方針）

Validator が **errors** を返した場合、呼び出し側（Orchestrator や API）で次のようにする。

### 4.1 ループ方針

1. AI に OrganizerReport / AdvisorReport の **JSON のみ** を出力させる（プロンプトで 40 の形を指定）。
2. 出力をパースし、`validateOrganizerReport(report, validNodeIds)` または `validateAdvisorReport(report, validNodeIds)` を実行。
3. `result.errors.length > 0` なら、**再生成用プロンプト** に以下を追加して AI に再度出力させる。
   - 「以下の Must 条件を満たしていません。これらをすべて満たす JSON だけを再度出力してください。」
   - `result.errors` を箇条書きで列挙。
4. 最大 2 回まで再生成を試行。2 回目も errors がある場合は、その時点の errors を人間に表示するか、レポートを「未採用」として扱う。

### 4.2 再生成プロンプトに含める文言（例）

```
【検証エラー】以下の項目を満たすように、同じ形式の JSON だけを再出力してください。
- summary は必須で、1 文字以上入れてください。
- decomposition_proposals の各要素では、suggested_children を 2 件以上含めてください。
- すべての node_id（target_node_id, from_node_id, to_node_id, node_ids）は、入力に存在する ID のみ使用してください。利用可能な ID: n1, n2, n3
```

（実際の `errors` 配列と `validNodeIds` を埋め込む。）

### 4.3 実装側の責務

- **validator** は `ValidationResult` を返すだけ。ループや AI 呼び出しは行わない。
- **API** または **Orchestrator** が「パース → validate → errors があれば再生成プロンプトに渡す → 再パース → validate」を行う。
- 自己修正用の **プロンプト文字列を組み立てる関数**（`buildCorrectionPrompt(errors: string[], validNodeIds?: string[])`）を `src/lib/proposalQuality/selfCorrection.ts` に用意し、呼び出し側が利用する。

---

## 5. テスト戦略（40 のサンプル 10 件を自動テスト化）

- **フレームワーク**: Vitest を導入し、`src/lib/proposalQuality/` に対する単体テストとする。
- **テストケース**: 40 §6.2（Organizer 5 件）と §6.3（Advisor 5 件）の 10 サンプルに対応する **入力・期待出力** をコードで定義する。
  - **O1〜O5**: 入力は「Node 一覧（0 件 / 1 件 / 3 件 / 1 件（分解指示）/ 2 件）」と「期待する OrganizerReport の Must 条件」。
  - **A1〜A5**: 入力は「Node 一覧」と「期待する AdvisorReport の Must 条件」。
- **やり方**:
  - 各サンプルで「**正しい形の Report オブジェクト**」をテストデータとして用意し、`validateOrganizerReport` / `validateAdvisorReport` に渡す。**Must を満たす**ので `result.ok === true` かつ `result.errors.length === 0` であることを assert する。
  - あわせて、**意図的に Must を崩した Report**（例: summary 空、options 1 件だけ）を渡し、`result.ok === false` かつ `result.errors.length >= 1` となることを assert する。
- **配置**: `src/lib/proposalQuality/__tests__/validator.test.ts`（または `.spec.ts`）。サンプルデータは同じディレクトリの `samples.ts` にまとめてもよい。

---

## 6. 既存 API への接続（Organizer が payload を生成する場所）

- **Organizer / Advisor は「提案を出すだけ」**。Apply（status 確定）は行わない。18_Skill_Governance §2.2 の通り、確定は人間確認必須（estimate-status の Apply または PATCH）。
- **Organizer が payload を生成する場所**:
  - **案 A（推奨）**: 将来、**POST /api/organizer/run** または **POST /api/advisor/run** を用意し、リクエスト body に「Node 一覧（GET /api/dashboard の trays を flatten したもの）」や「対象 node_id」を渡す。サーバー側で AI を呼び出す場合は、その **出力 JSON を validator に通し**、`ok === true` のときだけレスポンスで返す。`ok === false` のときは `errors` を返し、クライアントまたは Orchestrator が自己修正ループを行う。
  - **案 B**: Organizer / Advisor を **クライアントまたは外部サービス** で実行する場合、その出力を **POST /api/proposal-quality/validate** に送り、`{ ok, errors, warnings }` を得る。validate 通過後にのみ、ダッシュボード UI に表示する。**Apply するとき**は、人間が UI で案を選び、既存の **POST /api/nodes/{id}/estimate-status**（Confirm 付き）または **POST /api/confirmations** → estimate-status の流れで実行する。
- **既存 API との関係**:
  - **GET /api/dashboard**: Node 一覧取得。Organizer / Advisor の **入力** として利用する。
  - **POST /api/nodes/{id}/estimate-status**: status 変更の唯一のゲート。Advisor の「案を選んだ」結果を人間がここで実行する。Organizer の「分解案」を実行する場合は、将来 **POST /api/nodes** や **POST /api/nodes/{id}/children** 等が拡張されたときに、人間確認のうえで呼び出す。
  - **PATCH /api/nodes/{id}/status**: 09 では非推奨。本パイプラインでは利用しない。正式は estimate-status。

**まとめ**: 現状は **validator を lib と validate API で提供**し、Organizer/Advisor の出力が「どこで生成されても」同じルールで検証できるようにする。payload を「生成する場所」は、run API（案 A）またはクライアント/外部（案 B）のいずれでもよいが、**必ず validator を通過させてから render / Apply に進む**。

---

## 7. 提案生成 API（実運用）

**POST /api/organizer/run** と **POST /api/advisor/run** を実装済み。

- **入力**: `{ dashboard, focusNodeId?, userIntent?, constraints? }`。最小は `dashboard` のみ。`dashboard` は GET /api/dashboard の `{ trays }` と同じ形（各 tray は Node の配列。id / title / status 等）。
- **validNodeIds**: サーバーで `dashboard` から抽出。クライアントは渡さない。
- **LLM**: 「JSON のみ出力」を指示し、OpenAI Chat Completions（`response_format: json_object`）を利用。未設定時は 500。
- **環境変数**: **OPENAI_API_KEY** を必須とする。未設定時は `OPENAI_API_KEY is not set` で失敗。
- **フロー**: 生成 → validator → NG なら selfCorrection で最大 2 回再生成 → 最終結果を返す。
- **レスポンス**: `{ ok, report, errors, warnings, rendered? }`。`ok === true` のときのみ `rendered` を付与。`ok === false` のときは `errors` を返して render しない。
- **ログ**: 各 attempt の errors / warnings / ok、最終の retryCount と ok をサーバーログ（console）に出力。

---

## 8. 参照

- **40_proposal_quality.md** — Must / Should・サンプル 10 件・スキーマ
- **21_SubAgent_Organizer.md** — Organizer 出力型
- **22_SubAgent_Advisor.md** — Advisor 出力型
- **09_API_Contract.md** — estimate-status / PATCH の位置づけ
