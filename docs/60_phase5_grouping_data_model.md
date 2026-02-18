# 60 — Phase 5-B grouping データモデル

Phase5-B で grouping を実装する前に、「グループを DB でどう表現するか」を仕様として確定する。MVP で実装する最小機能に絞る。

**前提**: 51_phase5_diff_schema.md §3.2（group_label, node_ids）、59_phase5_b_mvp_plan.md。既存は nodes / relations / confirmation_events。

---

## 1. 3 方式の比較

| 観点 | 中間テーブル | ノード属性 | relations 流用 |
|------|--------------|------------|-----------------|
| **概要** | groups と group_members を新規作成。1 グループ = 1 行 + メンバー数行。 | nodes に group_id または group_label を 1 列追加。 | グループを「グループ用 Node」1 個で表し、メンバーを relation(group_node, member_node, "member") で紐づける。 |
| **1 node が複数グループに属する** | 可（group_members が多対多） | 不可（1 列のみ） | 可（グループ Node ごとに relation） |
| **スキーマ変更** | 新規テーブル 2 つ | nodes に 1 列追加 | 既存 relations のみ利用。グループ用 Node の種別が必要。 |
| **Apply 時の処理** | 1 行 INSERT groups + N 行 INSERT group_members | N 件の nodes を UPDATE | 1 行 INSERT nodes（グループ用）+ N 行 INSERT relations |
| **既存 nodes への影響** | なし | あり（カラム追加・更新） | なし（ただし「グループ」Node が nodes に混ざる） |
| **重複・409** | 同一 (group_id, node_id) の二重登録を PK/UNIQUE で防止 | 同一 node の二重設定は上書き or 制約で防止 | relation の UNIQUE(from, to, type) で同一リンク二重防止 |
| **取り消し（Undo）** | グループ削除 = group 削除で CASCADE または group_members 削除 | nodes の group_id を NULL に更新 | グループ Node 削除 or relations 削除 |
| **MVP との相性** | 1 confirmation = 1 group 作成 + N メンバーで明確 | 1 node 1 グループに制限すれば簡単だが、Organizer は「複数 node を 1 グループに」が主。逆方向の「1 node 複数グループ」も将来あり得る。 | グループが Node になり、一覧・トレイとの整合や「グループ Node の扱い」を別途決める必要がある。 |

---

## 2. 推奨方式：中間テーブル

**結論：中間テーブル方式を採用する。**

- **理由**
  - **1 node が複数グループに属する** を自然に表現できる。Organizer は「この N 個を group_label でまとめる」だが、別の Apply で同じ node を別グループに入れることはあり得る。ノード属性 1 列では不足する。
  - **既存 nodes を変更しない**。既存の Node 一覧・トレイ・relation に影響しない。
  - **Apply の境界が明確**：1 grouping diff = 1 つの group を INSERT + N 件の group_members を INSERT。Phase5-A の「1 confirmation = 1 変更」と対応しやすい。
  - **relations 流用** は「グループ = Node」にすると、その Node の表示・ライフサイクルを別仕様で決める必要があり、MVP の範囲を超える。relation テーブルの意味も「Node 間の参照」から「Node とグループ Node のメンバーシップ」に広がり、52/51 の relation と混在する。

MVP では **groups 1 テーブル + group_members 1 テーブル** で、1 回の Apply で「1 グループ作成 + 複数 node をそのグループのメンバーとして登録」とする。

---

## 3. 最小 DDL 案

```sql
-- Phase 5-B: グループ（Organizer grouping Apply 用）
-- 1 グループ = 1 行。メンバーは group_members で多対多。

CREATE TABLE IF NOT EXISTS groups (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  group_label  TEXT         NOT NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id   UUID         NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  node_id    UUID         NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (group_id, node_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_node ON group_members (node_id);

COMMENT ON TABLE groups IS 'Phase 5-B grouping。1 Apply = 1 行。';
COMMENT ON TABLE group_members IS 'Phase 5-B grouping。1 グループに属する Node。';
```

- **groups**: 1 回の grouping Apply で 1 行を INSERT。group_label は Organizer の提案ラベル（同じラベルで別グループを複数作ることは許容する）。
- **group_members**: 同一グループ内で同じ node を二重登録しないように PRIMARY KEY (group_id, node_id)。

---

## 4. Apply 時の処理（1 confirmation = 1 grouping diff）

1. **入力**: POST /api/diffs/grouping/apply の body に `confirmation_id` のみ。confirmation_events から proposed_change を取得。
2. **検証**: proposed_change.type === "grouping"、group_label（非空）、node_ids（配列・2 件以上・各要素が nodes に存在）を検証。不足・不正なら 400。
3. **反映**（同一トランザクション推奨）:
   - `groups` に 1 行 INSERT（id = gen_random_uuid(), group_label = proposed_change.group_label）。
   - 得られた group_id に対して、node_ids の各 node_id で `group_members` に 1 行ずつ INSERT。
   - group_members の INSERT で UNIQUE 違反（同一 group_id, node_id の二重）が起きた場合はロールバックし 409 を返す（通常は同一 diff の二重 Apply は confirmation 消費で防がれるため、発生しにくい）。
4. **confirmation の消費**: confirmation_events の該当行を consumed = true, consumed_at = now() に更新（Phase5-A と同様）。
5. **レスポンス**: 200 で { ok: true, applied: true, group_id, group_label, node_ids } を返す。

※ 同一 group_label + 同一 node_ids の「内容が同じ」別 Apply は、MVP では禁止しない。その都度新しい group_id で 1 グループが追加される。重複抑制が必要なら将来、ビジネスルールで「同一 group_label かつ同一 node_ids の組み合わせが既に存在する場合は 409」を追加する。

---

## 5. 既存 Phase5-A の安全パターンとの整合

| パターン | Phase5-A（relation） | Phase5-B（grouping） |
|----------|----------------------|----------------------|
| **Confirm 必須** | apply は confirmation_id 必須。無ければ 400。 | 同じ。confirmation_id 必須。 |
| **1 confirmation = 1 変更** | 1 confirmation で 1 本の relation を追加。 | 1 confirmation で 1 グループ作成 + N 件の group_members 追加。 |
| **confirmation の消費** | Apply 成功後に consumed に更新。同一 confirmation の再送は 409。 | 同じ。Apply 成功後に consumed に更新。再送は 409。 |
| **有効期限** | expires_at 切れは 403。 | 同じ。expires_at 切れは 403。 |
| **409 の意味** | 既に consumed / または relation が既に存在（UNIQUE 違反）。 | 既に consumed。group_members の UNIQUE 違反は理論上のみ（新規 group_id のため通常は発生しない）。 |
| **二重送信防止（UI）** | applyInFlightRef + disabled。 | 同じパターンを grouping Apply にも適用する。 |

Phase5-A で確立した「confirmation 必須 → 検証 → DB 反映 → consume」の流れをそのまま grouping に適用する。API の形は POST /api/diffs/grouping/apply、body { confirmation_id } とする。

---

以上で、MVP に必要な「グループの DB 表現」と Apply 処理・安全パターンの整合を確定する。実装時は 59 の DoD と本ドキュメントに従う。
