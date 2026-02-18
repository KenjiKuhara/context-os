# 認証・RLS・NOT NULL 最終検証チェックリスト

追加実装は行わない。検証と完了判定のみ。  
認証は「画面を隠す機能」ではなく、**データが守れているか**で完了判定する。

**ルート保護**（/dashboard 未認証時のリダイレクト）の実装の所在と middleware の有無は [140_local_dev_setup.md](140_local_dev_setup.md) の「10. ルート保護の実装の所在」を参照。

---

## 1. DB 構造の確認（必須）

### 1-1. user_id に NULL が存在しないこと

**実行 SQL**（Supabase SQL Editor または `supabase db execute -f scripts/verify-auth-db.sql`）:

```sql
SELECT count(*) AS null_count
FROM public.nodes
WHERE user_id IS NULL;
```

**期待値**: `null_count = 0`  
**結果**: null_count = 0  日付: 20260215

---

### 1-2. user_id が NOT NULL であること

**実行 SQL**:

```sql
SELECT column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'nodes'
  AND column_name = 'user_id';
```

**期待値**: `is_nullable = 'NO'`  
**結果**: is_nullable = 0  日付: 20260215

---

### 1-3. RLS が有効であること

**実行 SQL**:

```sql
SELECT relrowsecurity
FROM pg_class
WHERE relname = 'nodes';
```

**期待値**: `relrowsecurity = true`  
**結果**: relrowsecurity = 0  日付: 20260215

---

## 2. RLS 動作検証（アプリレベル）

### 2-1. ユーザー別データの分離

**手順**:

1. ユーザー A でログイン
2. ノードを 1 件作成（タイトルに "A-test" など識別可能な値）
3. ユーザー B を Supabase Auth で作成
4. ユーザー B でログイン
5. ダッシュボードまたは `GET /api/nodes` / `GET /api/dashboard` を実行

**期待結果**: ユーザー A のノードは表示されない（ユーザー B には 0 件）。エラーではなく「自分のデータだけ」が返る。

**結果**: OK / NG  日付: __________

---

### 2-2. 直接 ID 指定アクセスの検証

ユーザー B の状態で、ユーザー A の node_id を直接指定して:

| 操作 | 期待結果 | 結果 |
|------|----------|------|
| 取得（GET /api/nodes/[id] 等） | 0 件 / 404（401 ではない） | __________ |
| 更新（PATCH /api/nodes/[id]） | 影響行 0 または 404 | __________ |
| 削除（該当 API があれば） | 影響行 0 または 404 | __________ |

**判定**: 401 ではなく「操作できない状態」（RLS による制御）が正解。

**結果**: OK / NG  日付: __________

---

## 3. セッション確認

| 確認項目 | 期待結果 | 結果 |
|----------|----------|------|
| ログイン後にブラウザをリロード | ログイン状態が維持される | __________ |
| ログアウト後に /dashboard にアクセス | アクセス不可（/login へリダイレクト） | __________ |

**結果**: OK / NG  日付: __________

---

## 完了定義（Definition of Done）

以下をすべて満たしたら、認証実装を**完了**とする。

- [ ] user_id に NULL が存在しない（1-1）
- [ ] user_id が NOT NULL になっている（1-2）
- [ ] RLS が有効（1-3）
- [ ] 他ユーザーのデータにアクセスできない（2-1, 2-2）
- [ ] セッションが保持される（3）
- [ ] ログアウト後はアクセス不可（3）

**検証実施日**: __________  
**判定**: 完了 / 未完了
