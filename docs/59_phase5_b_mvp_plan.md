# 59 — Phase 5-B MVP 計画（grouping 先行）

Phase5-B で **grouping と decomposition のどちらを先にやるか** を 4 観点で比較し、**grouping を先に実施する** と結論した。本ドキュメントは grouping に限定した Phase5-B MVP の DoD（手動 E2E）を 1 ページで定義する。

**前提**: 51_phase5_diff_schema.md（§3.2 grouping）、52・53、Phase5-A 実装（55・57・58）。グループの DB 表現（テーブル・カラム）は別 doc で定義する。

---

## 1. grouping と decomposition の比較（4 観点）

| 観点 | grouping | decomposition |
|------|----------|---------------|
| **事故リスク** | **中**。グループのまとめ間違いで混乱しうるが、**Node は増えない**。誤っても分類・ラベル程度。 | **高**。子 Node が複数でき、文言・個数が違うと机が散らかる。取り消しが重い。 |
| **実装難易度** | **中**。グループの DB 表現（ラベル付与 or 中間テーブル）を決めれば、1 件の「グループ付け」を Apply する API で閉じる。 | **高**。子 Node 作成 API・親子紐づけ・トランザクション境界・仮 ID → 実 ID の対応が必要。 |
| **価値** | **中**。整理・分類で机の見通しが良くなる。relation ほど即効の「見える化」ではないが、十分な価値がある。 | **高**。構造が変わるので体験インパクトは大きい。 |
| **後戻りコスト** | **低〜中**。取り消し = グループ付けの解除やラベル削除。Node 自体は増えていないので影響範囲が限定的。 | **高**。取り消し = 子 Node 削除 or 親子紐づけ解除。子が複数いると削除・依存関係の整理が重い。 |

**結論：Phase5-B では grouping を先にやる。**

- 事故リスク・実装難易度・後戻りコストのいずれも grouping の方が低く、Phase5-A と同様に「一度に 1 主軸で E2E を閉じる」「リスクと負荷を抑えた方から」という方針に合う。grouping で Confirm → Apply のパターンを拡張したあと、decomposition に進む。

---

## 2. Phase5-B MVP（grouping）の Definition of Done（手動 E2E）

以下を満たした時点で **Phase5-B MVP（grouping のみ）** を完了とする。

### スコープ

- **やること**: OrganizerReport の **grouping_proposals** だけを Diff に変換し、**grouping タイプの Diff** だけを UI に表示・選択・Confirm・Apply する。relation は既存のまま。decomposition は変換・表示・Apply しない。
- **やらないこと**: decomposition、Undo、一括適用、既存 Node 削除・note 自動変更。

### 実装の流れ（Phase5-A と同じパターン）

1. **型・Transform** — grouping 用の change 型（51 §3.2 準拠：group_label, node_ids）を追加。transform で grouping_proposals を Diff に変換。
2. **Validator** — type === "grouping" のときのルール（必須フィールド、node_ids が validNodeIds に含まれる、重複・整合性は必要に応じて）。
3. **organizer/run 拡張** — レスポンスの diffs に **grouping** を追加（relation と併存）。VALID / NEEDS_REVIEW のみ返す。
4. **Confirmations** — proposed_change.type = "grouping"、diff_id / group_label / node_ids 等を格納。
5. **Apply API** — POST /api/diffs/grouping/apply。confirmation_id 必須。グループの DB 表現に 1 件反映し、confirmation を consumed に更新。
6. **UI** — Organizer タブに「適用可能な Diff（grouping）」ブロックを追加。1 件選択 → プレビュー → 「この Diff を反映する」→ Confirm → Apply。二重送信防止。成功時 onRefreshDashboard()。
7. **refresh** — Apply 成功後に dashboard を再取得。MVP ではグループ情報が API レベルで確認できれば OK。UI 上でグループ表示が変わらなくても不問としてよい。

### DoD チェックリスト（手動 E2E で 1 回やり切る）

| # | 条件 | 確認 |
|---|------|------|
| 1 | Organizer 提案で grouping タイプの Diff が 1 件以上 run の `diffs` に含まれる | [ ] |
| 2 | Diff 一覧に VALID と NEEDS_REVIEW の grouping のみ表示され、INVALID は含まれない | [ ] |
| 3 | 1 件選択でプレビュー（group_label・node_ids・reason・risk・注意）が表示される | [ ] |
| 4 | 「この Diff を反映する」→ Confirm → Apply API でグループ情報が DB に 1 件反映される | [ ] |
| 5 | refresh で dashboard が更新され、反映結果が API レベルで確認できる | [ ] |
| 6 | Apply 失敗時はエラーメッセージ表示。NEEDS_REVIEW は「要確認」表示 | [ ] |

**以上を手動 E2E で 1 回やり切れた状態で Phase5-B MVP（grouping）を Done とする。** グループの DB スキーマ・Apply の具体仕様は 60 以降の doc で定義する。
