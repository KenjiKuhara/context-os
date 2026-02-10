# 67 — Phase 5-C decomposition クローズアウト

**Phase5-C MVP（decomposition Apply）を「完了」として正式にクローズする。** 証跡は 66、手順は 65 を参照する。本ドキュメントはプロジェクト管理上の区切りとしての終了札とする。

---

## 1. 完了宣言

- **Phase5-C MVP（decomposition Diff の Apply）は完了した。**
- UI 上で Apply 成功（親に子 2 件作成）まで確認した。Organizer 実行で diffs に decomposition が含まれる場合、UI に「適用可能な Diff（decomposition）」を表示し、1 件選択 → Confirm → Apply → nodes に子追加・node_children に親子紐づけ → refresh、まで実施可能である。DB 確認（nodes 増分・node_children・confirmation consumed）および 409（consumed）確認を 66 に記録した。

---

## 2. Definition of Done チェック（65 準拠）

| # | 条件 | 結果 |
|---|------|------|
| 1 | Organizer 提案で decomposition タイプの Diff が run の `diffs` に含まれる（または fixture で Apply 経路を検証） | ✅ |
| 2 | Diff 一覧に VALID と NEEDS_REVIEW の decomposition のみ表示され、INVALID は含まれない | ✅ |
| 3 | 1 件選択でプレビュー（親 node_id・子件数・子タイトル・reason・要確認）が表示される | ✅ |
| 4 | 「この Diff を反映する」→ Confirm → Apply API で子 nodes 作成＋node_children に反映される | ✅ |
| 5 | refresh で dashboard が更新され、反映結果が API/DB レベルで確認できる | ✅ |
| 6 | Apply 失敗時はエラーメッセージ表示。NEEDS_REVIEW は「要確認」表示 | ✅ |
| 7 | 同一 confirmation_id 再送で 409（already consumed）となる | ✅ |
| 8 | DB で子 Node 増分・node_children・confirmation consumed が確認できる | ✅ |

**以上を手動 E2E で 1 回やり切れた状態で Done とする。** 全項目 OK。

---

## 3. 既知の割り切り（MVP 外）

以下は Phase5-C MVP の範囲外であり、クローズ時点で未対応である。

| 項目 | 内容 |
|------|------|
| **Undo** | 適用した decomposition（子 Node 作成・親子リンク）の取り消しは行わない。 |
| **一括適用** | 複数 Diff を選択して一度に Apply する機能はない。1 Diff ずつ Confirm → Apply。 |
| **UI ツリー描画** | 親子がツリー表示で描画されなくても MVP では不問。API/DB で反映確認できればよい。 |
| **既存 Node の編集** | 既存 Node の削除・タイトル/note 変更は行わない。子の追加のみ。 |
| **decomposition の重複抑制** | 同一親・同一子タイトルでの重複 Apply の抑制は未対応。 |
| **子 title の正規化** | 前後空白の統一等は Apply 側では行っていない。 |
| **厳密なトランザクション** | Apply は逐次 INSERT。部分挿入が発生し得る。必要なら RPC 化を検討。 |

---

## 4. 次フェーズへの引き継ぎ

Phase5-C 完了後、必要に応じて検討・実装する候補を以下に挙げる。

| 候補 | 内容 |
|------|------|
| **ツリー表示** | 親子関係を UI 上でツリー・インデント等で表示する。node_children / nodes.parent_id を利用。 |
| **Undo** | 適用した decomposition の取り消し（子 Node 削除 or 論理削除、node_children 行削除）。 |
| **decomposition の重複抑制** | 同一 parent_node_id ＋同一子タイトル組み合わせの既存適用を検出し、INVALID または NEEDS_REVIEW にする。 |
| **子 title の正規化** | Apply 前または validator で trim・重複チェックを強化する。 |
| **Apply のトランザクション** | Postgres 関数（RPC）で「nodes INSERT → node_children INSERT → confirmation consumed」を 1 トランザクションで実行する。 |

---

## 5. 追加した API・スクリプト（Phase5-C）

| 種別 | パス / ファイル | 説明 |
|------|-----------------|------|
| API | `POST /api/diffs/decomposition/apply` | decomposition 1 件を適用。confirmation_id 必須。 |
| API | `GET /api/e2e-verify/decomposition` | E2E 用。nodesCount / nodeChildrenCount を返す。 |
| スクリプト | `scripts/e2e-decomposition.mjs` | API 経由 E2E。`E2E_SKIP_ORGANIZER=1` で fixture 使用可。 |

---

## 6. 安全原則（Phase5-A/B と同一）

Phase5-C でも Phase5-A/B で確立した安全原則を守っている。

| 原則 | 内容 |
|------|------|
| **Confirm 必須** | Apply は confirmation_id 必須。無ければ 400。 |
| **1 confirmation = 1 変更** | 1 回の Apply で 1 つの decomposition のみ反映。 |
| **consume** | Apply 成功後に confirmation を consumed に更新。二重適用は 409。 |
| **二重送信防止（UI）** | decompositionApplyInFlightRef + ボタン disabled。 |
| **INVALID を返さない** | organizer/run の diffs は VALID と NEEDS_REVIEW のみ返し、INVALID は含めない。 |

---

**以上をもって Phase5-C decomposition MVP をクローズする。**
