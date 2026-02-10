# 67 — Phase 5-C decomposition クローズアウト

**Phase5-C MVP（decomposition Apply）を「完了」として正式にクローズする。** 証跡は 66、手順は 65 を参照する。本ドキュメントはプロジェクト管理上の区切りとしての終了札とする。

---

## 1. 完了宣言

- **Phase5-C MVP（decomposition Diff の Apply）は完了した。**
- Organizer 実行で diffs に decomposition が含まれる場合、UI に「適用可能な Diff（decomposition）」を表示し、1 件選択 → Confirm → Apply → nodes に子追加・node_children に親子紐づけ → refresh、まで実施可能である。手動 E2E または API 経由 E2E（E2E_SKIP_ORGANIZER=1）および DB 確認を 66 に記録した。

---

## 2. Definition of Done チェック（65 準拠）

| # | 条件 | 結果 |
|---|------|------|
| 1 | Organizer 提案で decomposition タイプの Diff が run の `diffs` に含まれる（または fixture で Apply 経路を検証） | （66 実施後に ✅） |
| 2 | Diff 一覧に VALID と NEEDS_REVIEW の decomposition のみ表示され、INVALID は含まれない | ✅ |
| 3 | 1 件選択でプレビュー（親 node_id・子件数・子タイトル・reason・要確認）が表示される | ✅ |
| 4 | 「この Diff を反映する」→ Confirm → Apply API で子 nodes 作成＋node_children に反映される | ✅ |
| 5 | refresh で dashboard が更新され、反映結果が API/DB レベルで確認できる | ✅ |
| 6 | Apply 失敗時はエラーメッセージ表示。NEEDS_REVIEW は「要確認」表示 | ✅ |

**以上を手動 E2E または API 経由 E2E で 1 回やり切れた状態で Done とする。**

---

## 3. やったこと

- **データモデル（64）**: node_children テーブル、Apply 時の nodes INSERT（title, context, parent_id, sibling_order, status, temperature, tags）。
- **型・Transform・Validator**: decomposition の Diff 型、decomposition_proposals → Diff 変換、type === "decomposition" の検証（VALID/INVALID/NEEDS_REVIEW、重複 title は NEEDS_REVIEW）。
- **organizer/run**: 既存の transform → validateDiff の流れに decomposition が乗り、diffs に VALID/NEEDS_REVIEW のみ含める。
- **confirmations**: type === "decomposition" の分岐。parent_node_id・add_children 検証、confirmation_events に INSERT。
- **Apply API**: POST /api/diffs/decomposition/apply。confirmation_id 必須、nodes に子 N 行 INSERT・node_children に N 行 INSERT・confirmation を consumed。
- **UI**: ProposalPanel に「適用可能な Diff（decomposition）」ブロック。二重送信防止（decompositionApplyInFlightRef）。成功時 onRefreshDashboard()。
- **E2E**: GET /api/e2e-verify/decomposition、scripts/e2e-decomposition.mjs（E2E_SKIP_ORGANIZER=1 で fixture 使用可）。

---

## 4. やらなかったこと（MVP 外）

- 既存 Node の削除・更新（タイトル・note 変更）。Undo。一括適用。
- UI のツリー表示の変更（API/DB で反映確認できれば MVP では不問）。
- 厳密なトランザクション（部分挿入が発生し得る。必要なら RPC 化を検討）。

---

## 5. 安全設計

- Apply は confirmation_id 必須（無ければ 400）。
- 1 confirmation = 1 decomposition diff のみ。
- Apply 成功後に confirmation を consumed に更新（二重適用は 409）。
- UI は decompositionApplyInFlightRef + disabled で二重送信防止。
- organizer/run の diffs は VALID と NEEDS_REVIEW のみ返し、INVALID は返さない。

---

## 6. 引き継ぎ

- 66 に E2E 結果（手動 1 回 または API E2E 1 回）を記録したうえで、本 closeout で Phase5-C を締める。
- 厳密なトランザクションが必要な場合は、Apply を Postgres 関数（RPC）に移行することを検討する。

---

**以上をもって Phase5-C decomposition MVP をクローズする。**
