# 54 — Phase 5-A Organizer Apply MVP 実装計画

Phase5-A（Organizer Apply：Diff 反映）を **最小で閉じる** ための実装順序とスコープを固定する。実装対象を **最小の Diff タイプ 1 つ** に絞り、E2E を先に閉じる。

**前提**: 51_phase5_diff_schema.md、52_phase5_diff_validator.md、53_phase5_organizer_to_diff_transform.md、Phase4 の実装（advisor/run, organizer/run, confirmations, estimate-status, ProposalPanel）。

---

## 1. MVP で最初に扱う Diff タイプを 1 つ選ぶ（理由付き）

### 候補の比較（事故リスク・実装容易性・価値）

| 観点 | relation | decomposition | grouping |
|------|----------|---------------|----------|
| **事故リスク** | **低**。relation 1 行追加だけ。誤っても「1 本のリンクが余計に張られる」で、Node は増えない。削除やロールバックも 1 行で済む。 | **高**。子 Node が複数でき、文言や個数が違うと机が散らかる。取り消しが重い。 | **中**。グループの持ち方（ラベル・エンティティ）に依存。まとめ間違いで混乱しうる。 |
| **実装容易性** | **高**。既存の relation テーブルに 1 行 INSERT する API を用意すればよい。子 Node 作成やトランザクションの複雑さが無い。 | **低**。子 Node 作成 API・親子紐づけ・トランザクション境界の設計が必要。 | **中**。「グループ」を DB にどう持つかが未確定だと、スキーマから決める必要がある。 |
| **価値** | **十分ある**。「A が B に依存する」を 1 本で表現でき、机の上の関係が可視化される。 | **高い**。構造が変わるので体験インパクトは大きい。 | **中**。整理・分類の価値はあるが、relation より「見える化」の即効性は劣る。 |

### 結論：最初にやる Diff タイプは **relation**

- **理由**：事故リスクが低く、実装が一番簡単で、かつ「関係を 1 本張る」という明確な価値がある。Phase5-A は「一度に 1 主軸」のため、**まず relation だけで E2E を閉じる**。decomposition / grouping は relation の Apply が動いたあとに追加する。
- **MVP の範囲**：OrganizerReport の **relation_proposals** だけを Diff に変換し、**relation タイプの Diff** だけを UI に表示・選択・Confirm・Apply する。decomposition_proposals と grouping_proposals は Transform で Diff に変換しても、**MVP では UI に表示しない**（または「今後対応」と表示する）ことで、実装を relation に限定する。

---

## 2. 実装スコープ（MVP）

### やること（API / UI / validator / confirm / apply / refresh）

- **Transform**：OrganizerReport → Diff[]。53 準拠。MVP では **relation 用の Diff だけ** を生成して返す（decomposition / grouping は生成してもフィルタして返さない、または生成しないでよい）。
- **Validator**：1 Diff を受け取り VALID / INVALID / NEEDS_REVIEW を返す。52 準拠。MVP では **relation 用のルール** だけ実装すればよい（from≠to、既存 relation 重複チェック等）。
- **organizer/run の拡張 または 新 API**：Organizer 実行の結果に **Diff[]（relation のみ）** を付与して返す。詳細は §4。
- **Confirmations**：relation Diff を 1 件適用するための confirmation を発行する。proposed_change に diff_id / type / from_node_id / to_node_id / relation_type 等を入れる。
- **Apply API**：1 つの relation Diff を DB に反映する。confirmation を消費し、relation テーブルに 1 行 INSERT する。既存の confirmations + 新規の apply 用 API、または estimate-status のような「適用専用」API を 1 本用意する。
- **UI**：ProposalPanel の Organizer タブで、**Diff 一覧（relation のみ）** を表示し、1 件選択 → プレビュー → 「この Diff を反映する」→ Confirm → Apply 呼び出し → refresh して反映確認。二重送信防止（Advisor Apply と同様の ref + disabled）。
- **refresh**：Apply 成功後に dashboard を再取得し、反映結果（relation が一覧やグラフに現れるか）を確認できるようにする。

### やらないこと（MVP の外）

- **残りの Diff タイプ**：decomposition と grouping の Apply は MVP では実装しない。UI にも出さない（または「準備中」表示のみ）。
- **Undo**：適用した relation の取り消しは MVP ではやらない。
- **一括適用**：複数 Diff を一度に選択して Apply する機能はつくらない。
- **既存 Node の削除・note の自動変更**：51 で扱わないとしているので MVP でも触らない。

---

## 3. 実装ステップ（順番が命）

以下の順で進める。前のステップが動いてから次に進む。

| Step | 内容 | 成果物・確認 |
|------|------|----------------|
| **Step 0** | **型定義**（Diff 型・判定結果） | 51 に合わせた TypeScript の型（Diff, RelationChange, ValidationResult 等）と、52 の VALID/INVALID/NEEDS_REVIEW を型で定義する。既存の proposalQuality の型と衝突しないよう、phase5 用のディレクトリまたは名前空間を切る。 |
| **Step 1** | **Transform 実装**（53 準拠） | `transformOrganizerReportToDiffs(report, context)` を実装。MVP では relation_proposals だけを走査し、relation タイプの Diff だけを返す。単体テストで「サンプル report → 期待する Diff[]」を検証。 |
| **Step 2** | **validateDiff 実装**（52 準拠） | `validateDiff(diff, context)` を実装。MVP では type === "relation" のときのルールだけ（必須フィールド、from≠to、validNodeIds、既存 relation 重複）を実装。VALID/INVALID/NEEDS_REVIEW と errors/warnings を返す。単体テストで通過・不通過ケースを検証。 |
| **Step 3** | **organizer/run のレスポンス拡張 または 新 API** | Organizer 実行後に、Transform → 各 Diff を validateDiff でフィルタし、**VALID と NEEDS_REVIEW の relation Diff だけ** をレスポンスに含める。§4 で「拡張するか新 API か」を決める。 |
| **Step 4** | **UI で Diff 一覧表示**（VALID / NEEDS_REVIEW のみ、注意バッジ） | ProposalPanel の Organizer タブで、run の結果に diffs が含まれていれば、一覧またはカードで表示する。NEEDS_REVIEW の Diff には「要確認」などのバッジを付ける。表示項目：対象（from/to）、何が変わるか（relation_type 1 本追加）、reason、risk（あれば）。 |
| **Step 5** | **1 Diff 選択 → Confirm → Apply API 呼び出し** | 「この Diff を反映する」ボタンで 1 件選択。確認ダイアログで「Node A と Node B の間に relation_type を 1 本追加します。よろしいですか？」のような文言を出し、OK で confirmations 発行 → Apply API 呼び出し。二重送信防止（applyInFlightRef と disabled）を入れる。 |
| **Step 6** | **refresh して反映確認** | Apply 成功後に onRefreshDashboard() を呼び、一覧を更新。成功メッセージで「反映しました（from → to / relation_type）」を表示。 |
| **Step 7** | **最小 E2E チェック（手動で OK）** | 手順：Organizer 提案生成 → relation Diff が 1 件以上出る → 1 件選択 → プレビュー確認 → 「この Diff を反映する」→ Confirm OK → Apply → dashboard 更新 → relation が反映されていることを確認。ここまでを手動でやり切れることを Definition of Done とする。 |

---

## 4. API 設計（MVP）

### 既存の /api/organizer/run を拡張するか、新 /api/organizer/diff を作るか

**結論：既存の /api/organizer/run のレスポンスを拡張する。**

- **理由**：クライアントは「Organizer 提案を 1 回取得したい」だけなので、**1 回のリクエストで report と diffs の両方** が返る方がシンプル。新 API にすると「run で report を取る → 別途 diff を取る」の 2 回になり、状態のずれや複雑さが増える。run のレスポンスに `diffs: Diff[]`（relation のみ、VALID/NEEDS_REVIEW のみ）を追加する形にする。
- **実装方針**：run 内で LLM → parse OrganizerReport → **transformOrganizerReportToDiffs**（relation のみ）→ 各 diff を **validateDiff** で判定 → INVALID を除いたリストを `diffs` としてレスポンスに載せる。既存の `report` / `rendered` / `errors` / `warnings` はそのまま。

### Confirmations の proposed_change に何を入れるか

- **diff_id**：必須。どの Diff を適用するかを一意に指す。
- **type**：`"relation"`（MVP では relation のみ）。
- **要約**：人間が「何に OK したか」を後から分かるように、次のいずれか（または全部）を入れる。
  - **from_node_id / to_node_id / relation_type**：relation の 3 点セット。
  - **summary**（任意）：例「Node A → Node B に depends_on を追加」のような短文。
- Apply API は、confirmation の proposed_change に含まれる diff_id と一致する Diff の内容（または confirmation に埋めた from/to/type）を使って、relation テーブルに 1 行 INSERT する。

---

## 5. UI 設計（MVP）

### ProposalPanel に統合するか、新コンポーネントにするか

**結論：ProposalPanel の Organizer タブに統合する。**

- **理由**：Phase4 で Organizer タブはすでに「提案を生成 → rendered 表示」まであり、その直下に「Diff 一覧 → 1 件選択 → 反映」を足すのが自然。別コンポーネントにすると、Organizer の結果と Diff の結果の受け渡しが増える。同じタブ内で「提案結果ブロック」の下に「適用可能な Diff（relation）」ブロックを追加する形にする。

### 表示項目（対象 / 何が変わる / reason / risk / 注意）

- **対象**：from_node_id と to_node_id（id または title が分かれば表示）。例「Node A（id: xxx） → Node B（id: yyy）」。
- **何が変わるか**：「この 2 つの Node の間に relation_type を 1 本追加します」のような短文。
- **reason**：Diff の reason をそのまま表示。
- **risk**：あれば表示。無ければ「特になし」または非表示。
- **注意**：NEEDS_REVIEW の Diff には「要確認」バッジまたはアイコンを付ける。理由（warnings の文言）をツールチップや折りたたみで出してもよい。

### 「この Diff を反映する」ボタンの配置、二重送信防止

- **配置**：各 Diff カード（または行）に「この Diff を反映する」ボタンを 1 つずつ付ける。Advisor の「この案で進める」と同様の位置づけ。
- **二重送信防止**：Advisor Apply と同様に、**applyInFlightRef** をクリック直後に立て、Confirm の前に ref で二重クリックをブロック。Confirm キャンセルで ref を解除、Apply 完了の finally でも解除。実行中はボタンを disabled にし「適用中…」表示にする。

---

## 6. 完了条件（Definition of Done）

以下を満たした時点で **Phase5-A MVP（relation のみ）** を完了とする。

1. **Organizer 提案** を生成すると、**relation タイプの Diff が 1 件以上** 含まれた `diffs` が run のレスポンスで返る（relation_proposals が 1 件以上ある report の場合）。
2. **Diff 一覧** が Organizer タブに表示され、**VALID と NEEDS_REVIEW の relation Diff だけ** が一覧に出る。INVALID は一覧に含まれない。
3. **1 件を選択** すると、プレビュー（対象・何が変わるか・reason・risk・注意）が表示される。
4. **「この Diff を反映する」** → **Confirm**（確認ダイアログで OK）→ **Apply API** が呼ばれ、**relation が DB に 1 行追加** される。
5. **refresh** により dashboard が更新され、**反映結果**（追加した relation が一覧や関係表示に現れる）が確認できる。
6. **エラー時**：Apply 失敗時はエラーメッセージを表示する（段階別エラー表示は Phase4 と同様）。**INVALID な Diff は最初から一覧に出さない** ため、画面上では「出てきた Diff はすべて Apply 可能」である。**NEEDS_REVIEW** の Diff は「要確認」などの注意表示が付いている。

以上を **手動 E2E** で 1 回やり切れる状態を MVP の Definition of Done とする。decomposition / grouping の Apply は、この MVP 完了後に別ステップで追加する。
