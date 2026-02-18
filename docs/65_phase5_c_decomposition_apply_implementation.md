# 65 — Phase 5-C decomposition Diff Apply 実装手順（事実ベース）

Phase5-C MVP（**decomposition Diff**）の実装内容を「事実ベース」で確定する。Phase5-A/B の confirmation 必須・consume・二重送信防止を踏襲し、DB は 64 準拠の**中間テーブル方式（node_children）** を採用する。

**参照**: 64_phase5_c_decomposition_data_model.md、51 §3.3、53 §3.1、60/61（grouping 同様の安全パターン）。

---

## 1. 追加・変更したファイル一覧

### 新規作成

| パス | 説明 |
|------|------|
| `docs/64_phase5_c_decomposition_data_model.md` | データモデル。node_children DDL、Apply 時の nodes INSERT 形。 |
| `supabase/migrations/20260210_create_node_children.sql` | node_children テーブル（parent_id, child_id, PK/FK, idx_node_children_child）。 |
| `src/app/api/diffs/decomposition/apply/route.ts` | POST。confirmation_id 必須。proposed_change.type === "decomposition" → nodes に子 N 行 INSERT → node_children に N 行 INSERT → confirmation を consumed。200 で parent_node_id, created_children 返却。 |
| `src/app/api/e2e-verify/decomposition/route.ts` | GET。nodesCount / nodeChildrenCount を返す。E2E 用。 |
| `scripts/e2e-decomposition.mjs` | API 経由 E2E。dashboard → (organizer/run または fixture) → confirmations → decomposition/apply → e2e-verify/decomposition。E2E_SKIP_ORGANIZER=1 で fixture 使用可。 |

### 変更

| パス | 変更内容 |
|------|----------|
| `src/lib/phase5Diff/types.ts` | DecompositionChange（parent_node_id, add_children）、DiffDecomposition、Diff ユニオンに decomposition を追加。 |
| `src/lib/phase5Diff/transform.ts` | decomposition_proposals を走査。53 §3.1 に従い parent_node_id / add_children、target_node_id = parent_node_id。事前フィルタ：親が validNodeIds 外・reason 空・suggested_children 空または長さ 0・子 title 空はスキップ。単体テストで decomposition ケースを追加。 |
| `src/lib/phase5Diff/validator.ts` | type === "decomposition" の分岐。parent_node_id 必須・validNodeIds に含まれる、add_children 配列・1 件以上、各 title 非空。重複 title または子 10 件超は NEEDS_REVIEW（warnings）。単体テストで decomposition ケースを追加。 |
| `src/app/api/organizer/run/route.ts` | transform が decomposition も返すため、payload.diffs に relation / grouping / decomposition の VALID・NEEDS_REVIEW が含まれる（コメント更新）。 |
| `src/app/api/confirmations/route.ts` | proposed_change.type === "decomposition" の分岐。diff_id, parent_node_id, children/add_children（1 件以上）、親が nodes に存在、各子 title 非空。confirmation_events に node_id = parent_node_id で INSERT。 |
| `src/components/ProposalPanel.tsx` | Organizer タブに「適用可能な Diff（decomposition）」ブロック。親 node_id・子件数・子タイトル一覧・reason・NEEDS_REVIEW バッジ。「このDiffを反映する」→ confirm → POST confirmations（type=decomposition）→ POST diffs/decomposition/apply。decompositionApplyInFlightRef で二重送信防止。成功時 onRefreshDashboard()。 |

---

## 2. DB（DDL）適用手順

- **DDL**: 64 §3 を `supabase/migrations/20260210_create_node_children.sql` に配置済み。
- **前提**: nodes テーブルが存在すること。node_children は nodes(id) を REFERENCES。
- **適用**: プロジェクトの Supabase マイグレーション手順に従い実行。実行後、`node_children` が存在することを確認。

---

## 3. API I/O（decomposition）

### 3.1 POST /api/organizer/run（拡張）

- **Response（成功時）**: diffs に **relation / grouping / decomposition** を含める。INVALID は含めない。

### 3.2 POST /api/confirmations（decomposition 用拡張）

- **Request**: `{ node_id?（decomposition のときは parent_node_id を内部で使用）, ui_action, proposed_change: { type: "decomposition", diff_id, parent_node_id, add_children } }`。add_children は 1 件以上、各 title 非空。
- **Response**: `{ ok, confirmation }`。confirmation.node_id = parent_node_id。

### 3.3 POST /api/diffs/decomposition/apply（新規）

- **Request**: `{ confirmation_id: string }`（UUID）。必須。
- **Response（成功）**: `{ ok: true, applied: true, parent_node_id, created_children: [{ id, title }, ...] }`。
- **Response（エラー）**: 400（不正入力・type 不正）、403（expires_at 切れ）、404（confirmation なし）、409（consumed）。

---

## 4. 安全設計（Phase5-A/B と同じ原則）

- Apply は **confirmation_id 必須**。無ければ 400。
- **1 confirmation = 1 decomposition diff のみ**。
- Apply 成功後に confirmation を **consumed** に更新。二重適用は 409。
- UI は **decompositionApplyInFlightRef + disabled** で二重送信防止。
- organizer/run の diffs は **VALID と NEEDS_REVIEW のみ**返し、INVALID は返さない。
- 失敗時は **consume しない**。API 側は逐次 INSERT のため、厳密なトランザクションが必要なら RPC 化を検討（64 §4）。

---

## 5. 最小 E2E チェックリスト

- [ ] confirmations（decomposition）発行 → confirmation_id 取得
- [ ] Apply API 成功（200、applied: true、created_children）
- [ ] refresh 相当（onRefreshDashboard）
- [ ] DB に nodes 増分 + node_children が子件数分
- [ ] 手動 E2E 1 回 または API 経由 E2E（E2E_SKIP_ORGANIZER=1 node scripts/e2e-decomposition.mjs）で証跡を 66 に記録

---

## 6. 未対応（MVP 外）

- 既存 Node の削除・更新（タイトル・note 変更）はしない。Undo なし。一括適用なし。
- UI のツリー表示が変わらなくても MVP では不問（API/DB で反映確認できれば OK）。

---

以上。実装は本手順に沿って完了し、E2E 結果は 66、クローズアウトは 67 に記録する。
