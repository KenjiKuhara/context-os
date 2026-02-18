# 57 — Phase 5-A 完了サマリ

Phase5-A（Organizer Apply：**relation Diff のみ**）の完了内容を要約する。**「relation Apply が動いた状態」をもって Phase5-A の完了とする**理由と、やったこと・やらなかったこと・安全設計・Phase5-B への引き継ぎを記す。

**参照**: 54_phase5_organizer_apply_mvp_plan.md、55_phase5_relation_diff_apply_implementation.md、56_phase5_relation_diff_apply_e2e_result.md。

---

## 1. 「relation Apply が動いた状態」を完了とする理由

Phase5-A の Definition of Done は **「relation タイプの Diff が、Organizer 実行結果として出てきて、1 件選択 → Confirm → Apply により DB に 1 行追加され、refresh まで一通り動くこと」** である。この状態を「完了」とする理由は以下のとおりである。

- **一度に 1 主軸で E2E を閉じる**  
  Organizer Apply には relation / decomposition / grouping の 3 タイプがあるが、**まず 1 タイプ（relation）だけで「提案 → Diff → Confirm → Apply → 反映」のルートを端から端まで通す**ことで、設計（Diff・Validator・Confirmations・Apply API）が正しく動くことを検証する。複数タイプを同時に実装すると不具合の切り分けが難しくなる。
- **事故リスクが最も低いタイプでパターンを確立する**  
  relation は「1 行 INSERT のみ」で、誤適用しても Node は増えず、取り消しも 1 行削除で済む。このタイプで **Confirm 必須・confirmation 消費・二重送信防止・重複時 409** などの安全パターンを確立し、Phase5-B（decomposition / grouping）でも同じパターンを踏襲できる。
- **価値が明確で、次の拡張の土台になる**  
  「A が B に依存する」を 1 本で表現できるため、即効性のある価値がある。かつ、**relation Apply が動いた時点で**、Diff 型・validator・confirmations の relation 対応・apply API・UI の Diff 表示と Apply ボタンが揃い、decomposition / grouping は「Diff タイプの追加」と「Apply 処理の拡張」で乗せていける。

したがって、**relation Apply が動いた状態**（手動 E2E で 1 回やり切れ、relations に 1 行追加されることが確認できた状態）をもって Phase5-A 完了とする。

---

## 2. Phase5-A でやったこと

| 領域 | 内容 |
|------|------|
| **型・モジュール** | phase5Diff 用の型（Diff, RelationChange, DiffValidationResult 等）と、Transform（relation_proposals → Diff[]）、Validator（relation のみ：必須・from≠to・validNodeIds・既存重複は existingRelations 渡し時のみ）を実装。単体テストを追加。 |
| **DB** | `relations` テーブルをマイグレーションで作成（from_node_id, to_node_id, relation_type、UNIQUE 制約、nodes への FK）。 |
| **API** | organizer/run のレスポンスに `diffs`（relation のみ、VALID/NEEDS_REVIEW）を追加。confirmations に type=relation の proposed_change を追加。POST /api/diffs/relation/apply を新設（confirmation_id 必須 → relations に 1 行 INSERT → confirmation を consumed に更新）。 |
| **UI** | ProposalPanel の Organizer タブに「適用可能な Diff（relation）」ブロックを追加。Diff カード（from→to, relation_type, reason、NEEDS_REVIEW 時は「要確認」バッジ）と「このDiffを反映する」ボタン。Confirm → confirmations 発行 → apply 呼び出し。二重送信防止。成功時 onRefreshDashboard() と成功/失敗メッセージ。 |
| **E2E 証跡** | 手動 E2E を実施し、56 に結果（成功・DB 確認・既知の割り切り）を記録。 |

---

## 3. やらなかったこと（MVP の外）

| 項目 | 説明 |
|------|------|
| **decomposition** | decomposition_proposals の Diff 変換・表示・Apply は行っていない。 |
| **grouping** | grouping_proposals も同様に未対応。 |
| **Undo** | 適用した relation の削除（取り消し）は実装していない。 |
| **一括適用** | 複数 Diff を選択して一度に Apply する機能はない。1 件ずつ Confirm → Apply。 |
| **run 時点での既存 relation 重複チェック** | existingRelations を run では渡していない。重複は apply 時の DB UNIQUE と 409 で検出。 |
| **refresh 後の UI 描画** | dashboard は再取得するが、relation をグラフの線や一覧として描画することは MVP の完了条件に含めていない（API レベルで relations が確認できればよい）。 |

---

## 4. 安全設計として守った原則

Phase5-A で守った原則は、Phase4 の品質ゲート思想を壊さず、その上に Diff Apply を乗せたものである。

| 原則 | 内容 |
|------|------|
| **Confirm 必須** | Apply する前に必ず confirmation を発行し、apply API は confirmation_id が無ければ 400。人間が「この 1 件を反映する」と明示した場合にのみ DB を書き換える。 |
| **1 confirmation で 1 変更** | 1 つの confirmation で 1 つの relation Diff のみを扱う。proposed_change に type / diff_id / from_node_id / to_node_id / relation_type を固定し、取り違えを防ぐ。 |
| **confirmation の消費** | Apply 成功後に confirmation を consumed に更新し、同一 confirmation の二重適用を防ぐ。 |
| **二重送信防止** | UI で「このDiffを反映する」クリック直後に ref を立て、Apply 完了の finally で解除。実行中はボタン disabled と「適用中…」表示。 |
| **INVALID は一覧に出さない** | organizer/run の diffs には VALID と NEEDS_REVIEW のみを含め、INVALID は最初から返さない。画面上に現れる Diff は「Apply 可能」なものに限定する。 |
| **重複時は 409** | 同一 (from, to, relation_type) の再適用は DB UNIQUE で弾き、409 と明確なエラーメッセージで返す。 |
| **既存 Phase4 フローを壊さない** | advisor/run、organizer/run の既存レスポンス（report, rendered, errors, warnings）はそのまま。confirmations は type で分岐し、既存の status_change 等は変更しない。 |

---

## 5. Phase5-B（decomposition / grouping）への引き継ぎ

Phase5-A で確立したパターンを Phase5-B でも使う。

| 引き継ぎ項目 | 内容 |
|--------------|------|
| **Diff 型・Transform・Validator** | types.ts に decomposition / grouping 用の change 型を追加。transform で該当 proposals を Diff に変換。validator で type 別のルール（必須・整合性・既存データとの重複等）を追加。51・52・53 のスキーマに沿って拡張する。 |
| **Confirmations** | proposed_change.type に `"decomposition"` / `"grouping"` を追加し、各タイプに必要な識別子（親 node_id、子の情報、グループ情報等）を proposed_change に含める。 |
| **Apply API** | /api/diffs/relation/apply と同様に、/api/diffs/decomposition/apply、/api/diffs/grouping/apply（または 1 本の apply で type で分岐）を用意。confirmation_id 必須・検証・DB 更新・confirmation 消費の流れは同じ。 |
| **UI** | Organizer タブで diffs に decomposition / grouping を表示するブロックを追加。「このDiffを反映する」→ Confirm → confirmations → apply の流れは relation と同じ。二重送信防止も同パターン。 |
| **DB・トランザクション** | decomposition は子 Node 作成・親子紐づけが必要。grouping はグループ用テーブルやラベルの設計に依存。Phase5-A の relations と同様、スキーマを決めてから apply で 1 件ずつ反映する形で拡張する。 |

Phase5-A の「relation Apply が動いた状態」は、**Diff → Confirm → Apply の共通パターンが動いている証**であり、Phase5-B はこのパターンを decomposition / grouping 用に拡張する形で進められる。
