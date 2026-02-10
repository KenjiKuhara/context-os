# 64 — Phase 5-C decomposition データモデル

Phase5-C で decomposition（親 Node に対する子 Node 追加＋親子紐づけ）を実装する前に、DB での表現を仕様として確定する。MVP で実装する最小機能に絞る。

**前提**: 51_phase5_diff_schema.md §3.3（parent_node_id, add_children）、53 §3.1。既存は nodes（title, context, parent_id, sibling_order, status, temperature, tags）、confirmation_events。

---

## 1. 方針（MVP）

- **decomposition** は「親 Node 1 つに対して子 Node を複数作り、親子リンクを作る」だけに絞る。
- 既存 Node の削除・更新（タイトル変更・note 変更）はしない。Undo もしない。一括適用もしない。
- **中間テーブル** `node_children`（parent_id, child_id）で親子を明示し、既存の `nodes.parent_id` とも整合させる（子 Node 作成時に `nodes.parent_id = parent_node_id` を設定し、さらに `node_children` に 1 行ずつ登録する）。

---

## 2. 既存 nodes スキーマ（INSERT 時必須・任意）

既存の POST /api/nodes および 04_Domain_Model に合わせる。

| カラム | 必須 | 説明 |
|--------|------|------|
| title | 必須 | 子 Node のタイトル。 |
| context | 任意 | 子 Node の文脈・内容。null 可。 |
| parent_id | 任意 | 親 Node の ID。decomposition では親を指定するため設定する。 |
| sibling_order | 任意 | 0 既定。子の並び順。 |
| status | 任意 | 既定 "CAPTURED"。suggested_status があれば READY 等を設定。 |
| temperature | 任意 | 既定 50。 |
| tags | 任意 | 既定 []。 |

Apply 時は **title** 必須、**context** は add_children の context をそのまま、**parent_id** = parent_node_id、**sibling_order** = 0, 1, 2...、**status** = suggested_status または "READY"、**temperature** = 50、**tags** = [] で INSERT する。

---

## 3. node_children テーブル（DDL）

親子関係を明示する中間テーブル。1 Apply = 親 1 件 + 子 N 件作成後、N 行 INSERT する。

```sql
-- Phase 5-C: 親子関係（decomposition Apply 用）
-- 04_Domain_Model の parent_id と併存。親子の明示的リンクとして使用。

CREATE TABLE IF NOT EXISTS node_children (
  parent_id   UUID         NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  child_id    UUID         NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (parent_id, child_id)
);

CREATE INDEX IF NOT EXISTS idx_node_children_child ON node_children (child_id);

COMMENT ON TABLE node_children IS 'Phase 5-C decomposition。親子リンク。1 Apply = N 行。';
```

- **node_children**: 同一 (parent_id, child_id) の二重登録を PK で防止。
- 既存の `nodes` に `parent_id` カラムがある場合は、子 Node 作成時に `parent_id` も設定し、04 の「子の取得は parent_id で検索」と整合させる。

---

## 4. Apply 時の処理（1 confirmation = 1 decomposition diff）

1. **入力**: POST /api/diffs/decomposition/apply の body に `confirmation_id` のみ。confirmation_events から proposed_change を取得。
2. **検証**: proposed_change.type === "decomposition"、parent_node_id（非空・nodes に存在）、children（配列・1 件以上・各 title 非空）を検証。不足・不正なら 400。
3. **反映**（**必ずトランザクション**）:
   - 各 child について `nodes` に 1 行 INSERT（title, context, parent_id = parent_node_id, sibling_order = index, status = suggested_status ?? "READY", temperature = 50, tags = []）。
   - 得られた各 child の id について `node_children` に 1 行ずつ INSERT（parent_id = parent_node_id, child_id = 新規 id）。
   - いずれか失敗したらロールバックし、500 または 409 を返す。成功時のみ confirmation を consumed に更新。
4. **confirmation の消費**: 反映成功後に confirmation_events を consumed = true, consumed_at = now() に更新。
5. **レスポンス**: 200 で { ok: true, applied: true, parent_node_id, created_children: [{ id, title }, ...] } を返す。

---

## 5. Phase5-A/B の安全パターンとの整合

| パターン | decomposition |
|----------|----------------|
| Confirm 必須 | confirmation_id 必須。無ければ 400。 |
| 1 confirmation = 1 変更 | 1 confirmation で 1 つの decomposition（親 1 + 子 N 作成 + N 行 node_children）。 |
| confirmation の消費 | Apply 成功後に consumed に更新。再送は 409。 |
| 有効期限 | expires_at 切れは 403。 |
| DB を汚さない | トランザクションでまとめて反映。失敗時はロールバック。 |

---

以上で、Phase5-C decomposition のデータモデルと Apply 処理を確定する。実装は 65 に従う。
