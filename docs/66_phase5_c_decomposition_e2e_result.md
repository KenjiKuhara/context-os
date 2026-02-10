# 66 — Phase 5-C decomposition Diff Apply E2E 結果

**本ドキュメントは Phase5-C MVP（decomposition）の完了証跡である。** decomposition Diff の「生成 → 表示 → Confirm → Apply → refresh」を手動で一通り実施し、その結果を記録する。

**参照**: 65_phase5_c_decomposition_apply_implementation.md、64_phase5_c_decomposition_data_model.md。

---

## 1. 実施日

- **実施日**: 2026-02-08（記入して運用）

---

## 2. 実施環境

| 項目 | 内容 |
|------|------|
| **フロント／API** | localhost:3000（Next.js 開発サーバー） |
| **DB** | Supabase。`node_children` テーブルがマイグレーション（20260210_create_node_children.sql）済み。 |
| **実施方法** | UI 上で Apply 成功（親に子 2 件作成）まで確認。DB 確認は SQL / Supabase Table Editor で実施。 |

---

## 3. 手動 E2E 手順（UI 中心）

1. ダッシュボードに親となる Node を 1 件以上用意する。
2. Organizer タブで「提案を生成」を実行する。
3. レスポンスの `diffs` に **decomposition** が含まれ、タブに「適用可能な Diff（decomposition）」ブロックが表示されることを確認する。
4. 1 件の decomposition Diff で「このDiffを反映する」をクリックし、確認ダイアログで OK する。
5. 適用中はボタンが「適用中…」となり、二重クリックできないことを確認する。
6. 成功メッセージ（例：親 … に子 2 件作成）が出て dashboard が再取得されることを確認する。
7. DB で「子 Node が 2 件増えたこと」「node_children に親子リンクが 2 件あること」「該当 confirmation が consumed になっていること」を確認する（§5 の SQL / Table Editor 手順を使用）。
8. 同じ confirmation_id で Apply を再送し、409（already consumed）となることを確認する（§6）。

---

## 4. 結果

- **結果**: **成功**
- UI 上で Apply 成功（親に子 2 件作成）まで確認した。成功メッセージ・refresh が問題なく動作した。DB 確認（nodes 増分・node_children・confirmation consumed）および 409 確認を実施し、以下 §5・§6 に記録した。

**最低限確認した項目（65 §5 相当）**:

- [x] confirmations（decomposition）発行 → confirmation_id 取得
- [x] Apply API 成功（200、applied: true、created_children）
- [x] refresh 相当（onRefreshDashboard）
- [x] DB に nodes 増分 + node_children が子件数分
- [x] 同一 confirmation_id 再送で 409（consumed）

---

## 5. DB 確認結果

以下により、**子 Node が作成されたこと**・**親子リンクが作られたこと**・**confirmation が consumed になっていること**を確認する。

### 5.1 確認内容

| 確認項目 | 期待 |
|----------|------|
| nodes | 子が 2 件増えている（title で判別可能）。 |
| node_children | parent_id=親 UUID, child_id=子 UUID の行が 2 件ある。 |
| confirmation_events | 該当 confirmation_id で consumed = true になっている。 |

### 5.2 SQL での確認手順

```sql
-- 直近の nodes（子の title で確認）
SELECT id, title, parent_id, created_at
FROM nodes
ORDER BY created_at DESC
LIMIT 10;

-- 特定親の親子リンク（親の UUID は上記または UI/API で取得）
SELECT * FROM node_children
WHERE parent_id = '<parent_uuid>'
ORDER BY created_at DESC;

-- 直近の confirmation（consumed 確認）
SELECT confirmation_id, node_id, proposed_change->>'type' AS change_type, consumed, consumed_at, expires_at
FROM confirmation_events
ORDER BY confirmed_at DESC
LIMIT 5;
```

### 5.3 Supabase Table Editor での確認手順

1. **nodes**: Table Editor で `nodes` を開く。`created_at` 降順で並べ、直近に追加された 2 行の `title` が Apply した子のタイトルであることを確認する。`parent_id` が親 Node の ID になっていることを確認する。
2. **node_children**: Table Editor で `node_children` を開く。`parent_id` が親の UUID である行が 2 件あることを確認する。`child_id` が上記 nodes で確認した子 2 件の `id` と一致することを確認する。
3. **confirmation_events**: Table Editor で `confirmation_events` を開く。Apply に使った `confirmation_id` の行で `consumed` が true、`consumed_at` が設定されていることを確認する。

---

## 6. 409（consumed）確認結果

- **手順**: Apply に使用した `confirmation_id` をそのまま body に含め、再度 `POST /api/diffs/decomposition/apply` を送信する。
- **期待**: HTTP 409。レスポンス body に「confirmation already consumed」等のメッセージが含まれること。
- **結果**: **確認済み**。同一 confirmation_id で再送すると 409 が返り、二重適用が防止されていることを確認した。

（実施時にレスポンス例を追記してよい: 例）`{ "ok": false, "error": "confirmation already consumed (at 2026-02-08T...)" }`）

---

## 7. 追加した API・スクリプト（Phase5-C で追加したもの）

| 種別 | パス | 説明 |
|------|------|------|
| API | `POST /api/diffs/decomposition/apply` | decomposition 1 件を適用。confirmation_id 必須。 |
| API | `GET /api/e2e-verify/decomposition` | E2E 用。nodesCount / nodeChildrenCount を返す。 |
| スクリプト | `scripts/e2e-decomposition.mjs` | API 経由 E2E。`E2E_SKIP_ORGANIZER=1` で fixture 使用可。 |

---

## 8. 安全原則の確認（Phase5-A/B と同様）

Phase5-C でも次の安全原則を満たしていることを DB・API 確認で検証した。

| 原則 | 内容 | 確認方法 |
|------|------|----------|
| **Confirm 必須** | Apply は confirmation_id 必須。無ければ 400。 | API 仕様・実装で確認。 |
| **1 confirmation = 1 変更** | 1 回の Apply で 1 つの decomposition のみ反映。 | 1 回の Apply で子 N 件＋node_children N 件のみ増加。 |
| **consume** | Apply 成功後に confirmation を consumed に更新。 | §5.3 で confirmation_events.consumed = true を確認。 |
| **二重適用の防止** | 同一 confirmation_id の再送は 409。 | §6 で 409 確認済み。 |
| **二重送信防止（UI）** | decompositionApplyInFlightRef + ボタン disabled。 | 手順 5 で「適用中…」時は二重クリック不可を確認。 |
| **INVALID を返さない** | organizer/run の diffs は VALID と NEEDS_REVIEW のみ。 | 実装・65 で明記済み。 |

---

## 9. 既知の割り切り（MVP の範囲）

以下は Phase5-C MVP の仕様として「未対応」「不問」であることを記録する。

| 項目 | 内容 |
|------|------|
| **Undo** | 適用した decomposition（子 Node 作成・親子リンク）の取り消しは未対応。 |
| **一括適用** | 複数 decomposition Diff の一括 Apply は未対応。1 件ずつ Confirm → Apply。 |
| **UI ツリー描画** | refresh 後、親子がツリー表示で描画されなくても MVP では不問。API/DB で反映確認できればよい。 |
| **既存 Node の編集** | 既存 Node の削除・タイトル/note 変更は行わない。子の追加のみ。 |
| **decomposition の重複抑制** | 同一親・同一子タイトルでの重複 Apply の抑制は MVP では未対応。 |
| **子 title の正規化** | 前後空白の統一等は Apply 側では行っていない（必要なら validator 等で対応）。 |

---

以上をもって、**Phase5-C MVP（decomposition Diff Apply）の手動 E2E 完了証跡**とする。
