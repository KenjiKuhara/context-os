# 25_Smoke_Test.md
## Smoke Test：本番想定の最小テスト手順

---

## 0. 前提

- Supabase の migration がすべて適用済み
- Next.js dev サーバーが起動済み（通常は `http://localhost:3000`）
- nodes テーブルに 1 件以上の Node が存在する
- 以下の `{NODE_ID}` を既存 Node の ID に置き換えて実行する
- Node の現在 status を確認してから各テストを実行する

**NEXT_BASE_URL の指定例（3000/3001 で迷わないように）**

Observer や curl のベース URL は環境変数 **NEXT_BASE_URL** で揃える。ポートが 3001 のときは次のようにする。

Bash / WSL / Git Bash の場合:

```bash
# 通常（Next.js が 3000 で起動している場合）
export NEXT_BASE_URL=http://localhost:3000

# Next.js が 3001 で起動している場合（例: 3000 が別プロセスで使用中）
export NEXT_BASE_URL=http://localhost:3001
```

**PowerShell の場合:**

```powershell
# 通常（Next.js が 3000 で起動している場合）
$env:NEXT_BASE_URL = "http://localhost:3000"

# Next.js が 3001 で起動している場合
$env:NEXT_BASE_URL = "http://localhost:3001"
```

curl で直接叩くときは、上記のどちらかに合わせて `http://localhost:3000` または `http://localhost:3001` を URL に使う。

```bash
# 現在の status を確認（3000 の場合）
curl -s http://localhost:3000/api/dashboard | jq '.trays | to_entries[] | .value[] | select(.id=="{NODE_ID}") | {id, status}'
```

---

## 1. 正常系：human_ui の confirmation 発行 → Apply → consumed

### 1.1 confirmation を発行

```bash
CONF=$(curl -s -X POST http://localhost:3000/api/confirmations \
  -H "Content-Type: application/json" \
  -d '{
    "node_id": "{NODE_ID}",
    "ui_action": "smoke_test",
    "proposed_change": {"type":"status_change","from":"{CURRENT_STATUS}","to":"{TARGET_STATUS}"}
  }')
echo "$CONF" | jq .
CONF_ID=$(echo "$CONF" | jq -r '.confirmation.confirmation_id')
echo "confirmation_id: $CONF_ID"
```

期待：`"ok": true`、`confirmation_id` が UUID。

### 1.2 Apply を実行

```bash
curl -s -X POST http://localhost:3000/api/nodes/{NODE_ID}/estimate-status \
  -H "Content-Type: application/json" \
  -d "{
    \"intent\": \"smoke test\",
    \"confirm_status\": \"{TARGET_STATUS}\",
    \"reason\": \"smoke test apply\",
    \"source\": \"human_ui\",
    \"confirmation\": {\"confirmation_id\": \"$CONF_ID\"}
  }" | jq .
```

期待：`"ok": true, "applied": true, "source": "human_ui"`。

### 1.3 SQL で確認

```sql
-- confirmation_events が consumed=true になっている
SELECT confirmation_id, consumed, consumed_at
FROM confirmation_events WHERE confirmation_id = '{CONF_ID}';

-- node_status_history に confirmation_id が記録されている
SELECT node_id, from_status, to_status, source, confirmation_id, consumed
FROM node_status_history WHERE confirmation_id = '{CONF_ID}';
```

---

## 2. 403：source=batch の Apply 拒否

```bash
curl -s -w "\nHTTP: %{http_code}\n" \
  -X POST http://localhost:3000/api/nodes/{NODE_ID}/estimate-status \
  -H "Content-Type: application/json" \
  -d '{"intent":"test","confirm_status":"COOLING","reason":"test","source":"batch"}'
```

期待：**HTTP 403**  
```json
{"ok":false,"error":"Apply from source \"batch\" is forbidden (18_Skill_Governance §3.3)"}
```

---

## 3. 403：ai_agent の confirmation なし

```bash
curl -s -w "\nHTTP: %{http_code}\n" \
  -X POST http://localhost:3000/api/nodes/{NODE_ID}/estimate-status \
  -H "Content-Type: application/json" \
  -d '{"intent":"test","confirm_status":"READY","reason":"test","source":"ai_agent"}'
```

期待：**HTTP 403**  
```json
{"ok":false,"error":"source=\"ai_agent\" requires confirmation_id ..."}
```

---

## 4. 403：期限切れ confirmation

### 4.1 期限切れ confirmation を手動作成

```sql
INSERT INTO confirmation_events (
  confirmation_id, node_id, confirmed_by, confirmed_at,
  ui_action, proposed_change, consumed, expires_at
) VALUES (
  '00000000-0000-0000-0000-expired00001',
  '{NODE_ID}', 'human', '2025-01-01T00:00:00Z',
  'test_expired',
  '{"type":"status_change","from":"{CURRENT_STATUS}","to":"{TARGET_STATUS}"}',
  false,
  '2025-01-02T00:00:00Z'
);
```

### 4.2 Apply を試行

```bash
curl -s -w "\nHTTP: %{http_code}\n" \
  -X POST http://localhost:3000/api/nodes/{NODE_ID}/estimate-status \
  -H "Content-Type: application/json" \
  -d '{
    "intent":"test","confirm_status":"{TARGET_STATUS}","reason":"test",
    "source":"human_ui",
    "confirmation":{"confirmation_id":"00000000-0000-0000-0000-expired00001"}
  }'
```

期待：**HTTP 403**  
```json
{"ok":false,"error":"confirmation 00000000-0000-0000-0000-expired00001 has expired ..."}
```

---

## 5. 409：consumed 済み confirmation の再利用

テスト 1 で使用した `CONF_ID`（consumed=true）を再利用する。

```bash
curl -s -w "\nHTTP: %{http_code}\n" \
  -X POST http://localhost:3000/api/nodes/{NODE_ID}/estimate-status \
  -H "Content-Type: application/json" \
  -d "{
    \"intent\": \"reuse test\",
    \"confirm_status\": \"{TARGET_STATUS}\",
    \"reason\": \"test\",
    \"source\": \"human_ui\",
    \"confirmation\": {\"confirmation_id\": \"$CONF_ID\"}
  }"
```

期待：**HTTP 409**  
```json
{"ok":false,"error":"confirmation {CONF_ID} is already consumed ..."}
```

---

## 6. 422：不正遷移 → confirmation は consumed されない

### 6.1 不正遷移用の confirmation を発行

```bash
# READY → DONE は遷移不可（IN_PROGRESS を経由する必要がある）
CONF2=$(curl -s -X POST http://localhost:3000/api/confirmations \
  -H "Content-Type: application/json" \
  -d '{
    "node_id": "{NODE_ID}",
    "ui_action": "smoke_test_422",
    "proposed_change": {"type":"status_change","from":"READY","to":"DONE"}
  }')
CONF2_ID=$(echo "$CONF2" | jq -r '.confirmation.confirmation_id')
```

注意：Node が `READY` 状態であることを確認してから実行。

### 6.2 Apply を試行

```bash
curl -s -w "\nHTTP: %{http_code}\n" \
  -X POST http://localhost:3000/api/nodes/{NODE_ID}/estimate-status \
  -H "Content-Type: application/json" \
  -d "{
    \"intent\": \"422 test\",
    \"confirm_status\": \"DONE\",
    \"reason\": \"test\",
    \"source\": \"human_ui\",
    \"confirmation\": {\"confirmation_id\": \"$CONF2_ID\"}
  }"
```

期待：**HTTP 422**  
```json
{"ok":false,"error":"transition from READY to DONE is not allowed","valid_transitions":[...]}
```

### 6.3 SQL で consumed されていないことを確認

```sql
SELECT confirmation_id, consumed FROM confirmation_events
WHERE confirmation_id = '{CONF2_ID}';
-- → consumed=false（422 で拒否されたため消費されていない）
```

---

## 7. 400：proposed_change 不一致

```bash
CONF3=$(curl -s -X POST http://localhost:3000/api/confirmations \
  -H "Content-Type: application/json" \
  -d '{
    "node_id": "{NODE_ID}",
    "ui_action": "smoke_test_mismatch",
    "proposed_change": {"type":"status_change","from":"{CURRENT_STATUS}","to":"CLARIFYING"}
  }')
CONF3_ID=$(echo "$CONF3" | jq -r '.confirmation.confirmation_id')

# confirm_status を READY にする（confirmation は CLARIFYING を承認している）
curl -s -w "\nHTTP: %{http_code}\n" \
  -X POST http://localhost:3000/api/nodes/{NODE_ID}/estimate-status \
  -H "Content-Type: application/json" \
  -d "{
    \"intent\": \"mismatch test\",
    \"confirm_status\": \"READY\",
    \"reason\": \"test\",
    \"source\": \"human_ui\",
    \"confirmation\": {\"confirmation_id\": \"$CONF3_ID\"}
  }"
```

期待：**HTTP 400**  
```json
{"ok":false,"error":"confirmation proposed_change.to (\"CLARIFYING\") does not match confirm_status (\"READY\")"}
```

---

## 8. 掃除関数の動作確認

```sql
-- 手動実行（削除件数が返る）
SELECT cleanup_expired_confirmations();

-- テスト 4 で作成した期限切れレコードが消えている
SELECT * FROM confirmation_events
WHERE confirmation_id = '00000000-0000-0000-0000-expired00001';
-- → 0 rows
```

---

## 9. ObserverReport の保存と取得（Phase 3-1 認証あり）

前提: `.env.local` に `OBSERVER_TOKEN` が設定されていること。  
Bash では `export OBSERVER_TOKEN=...`、PowerShell では `$env:OBSERVER_TOKEN = "..."` で設定してから実行する。

### 9.1 認証なしで 401 になること

```bash
curl -s -w "\nHTTP: %{http_code}\n" \
  -X POST http://localhost:3000/api/observer/reports \
  -H "Content-Type: application/json" \
  -d '{
    "payload": {
      "suggested_next": null,
      "status_proposals": [],
      "cooling_alerts": [],
      "summary": "test"
    },
    "generated_by": "smoke_test",
    "node_count": 0
  }'
```

期待：**HTTP 401**  
```json
{"ok":false,"error":"unauthorized"}
```

### 9.2 認証ありで保存成功し、latest で取得できること

```bash
curl -s -X POST http://localhost:3000/api/observer/reports \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OBSERVER_TOKEN" \
  -d '{
    "payload": {
      "suggested_next": {
        "node_id": "test-001",
        "title": "テストノード",
        "reason": "smoke test",
        "next_action": "確認する"
      },
      "status_proposals": [],
      "cooling_alerts": [],
      "summary": "smoke test レポート"
    },
    "generated_by": "smoke_test",
    "node_count": 1
  }' | jq .
```

期待：`"ok": true, "report_id": "UUID", "created_at": "..."`

SQL で確認（source / received_at も保存されていること）：

```sql
SELECT report_id, generated_by, node_count, source, received_at, payload->'summary' as summary
FROM observer_reports ORDER BY created_at DESC LIMIT 1;
```

### 9.3 最新の ObserverReport を取得する

```bash
curl -s http://localhost:3000/api/observer/reports/latest | jq .
```

期待：`"ok": true, "report": { "report_id": "...", "payload": { ... }, ... }`

レポートがない場合：

```bash
# observer_reports を空にしてからテスト
# DELETE FROM observer_reports; (SQL)
curl -s http://localhost:3000/api/observer/reports/latest | jq .
```

期待：`"ok": true, "report": null, "message": "No observer reports yet"`

---

## 10. GitHub Actions 手動実行 → healthcheck まで通る（Phase 3-2 / 3-2.1）

前提: リポジトリに `.github/workflows/observer_cron.yml` が push 済み。  
GitHub Secrets に **NEXT_BASE_URL**（Vercel の URL）と **OBSERVER_TOKEN** を設定済み（docs/27 §3.1 参照）。

### 10.1 手動実行

1. GitHub リポジトリ → **Actions** → **Observer Cron**
2. **Run workflow** をクリックし、ブランチを選んで実行
3. ワークフローが緑で完了するまで待つ

### 10.2 チェックリスト（ログで確認）

**workflow_dispatch で手動実行したあと、次をログで確認する。**

1. **Actions** → **Observer Cron** → 直近の run をクリック
2. **Run Observer and save report** ステップをクリックしてログを開く
3. 以下をチェックする：

- [ ] ログに **`✓ Saved: report_id=...`** が出ている（保存が成功している）
- [ ] そのあとに **`✓ healthcheck passed: report_id and summary match latest`** が出ている（latest と report_id / summary が一致）
- [ ] ステップが緑で完了し、workflow 全体が緑になっている

上記 2 行がログに出ていれば、Phase 3-2.1 の本番スモークは成功している。

### 10.3 期待結果（本番スモーク）

- **Run Observer and save report** ステップで次が順に成功すること：
  1. `python agent/observer/main.py --save` が POST /api/observer/reports に保存
  2. 直後に GET /api/observer/reports/latest で **healthcheck**
  3. 保存した `report_id` と latest の `report_id` が **一致**
  4. 保存した `payload.summary` と latest の `payload.summary` が **一致**
- ログに `✓ Saved: report_id=...` のあと `✓ healthcheck passed: report_id and summary match latest` が出力されること（→ 10.2 チェックリストで確認）
- いずれかが失敗した場合は exit code 1 でステップが失敗し、Actions が「赤」になる。失敗時は docs/27 §2（ログの見方・典型原因）を参照する。

### 10.4 latest に反映していることの確認（手動）

**API で確認（本番 URL を使う場合）:**

```bash
curl -s https://<your-vercel-app>.vercel.app/api/observer/reports/latest | jq '.ok, .report.payload.summary'
```

期待: `true` と、直前に Actions で保存したレポートの `summary` 文字列。

**ダッシュボードで確認:**

1. `https://<your-vercel-app>.vercel.app/dashboard` を開く
2. ページ下部の「Observer の提案」パネルに、直前に保存したレポートの summary / suggested_next 等が表示されること

失敗する場合は 27_Observer_Operations.md §2（失敗時の確認方法）を参照する。

**本番スモーク（curl で healthcheck 相当を手動確認する場合）:**

```bash
# 1) 保存（認証付き）
RESP=$(curl -s -X POST https://<your-vercel-app>.vercel.app/api/observer/reports \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OBSERVER_TOKEN" \
  -d '{"payload":{"summary":"smoke 3-2.1","suggested_next":null,"status_proposals":[],"cooling_alerts":[]},"generated_by":"smoke_test","node_count":0}')
echo "$RESP" | jq .
REPORT_ID=$(echo "$RESP" | jq -r '.report_id')

# 2) latest 取得
curl -s https://<your-vercel-app>.vercel.app/api/observer/reports/latest | jq .

# 3) report_id 一致確認
LATEST_ID=$(curl -s https://<your-vercel-app>.vercel.app/api/observer/reports/latest | jq -r '.report.report_id')
echo "saved report_id: $REPORT_ID"
echo "latest report_id: $LATEST_ID"
# 一致していること: [ "$LATEST_ID" = "$REPORT_ID" ] && echo "OK" || echo "MISMATCH"
```

期待: `saved report_id` と `latest report_id` が一致し、`payload.summary` が `"smoke 3-2.1"` であること。

---

## 11. 失敗通知の確認（Phase 3-3）

Observer Cron が失敗したときに Slack（または WEBHOOK_URL 先）へ通知が届くことを確認する。

### 11.1 意図的にトークンを壊して失敗 → 通知

1. **GitHub** → **Settings** → **Secrets and variables** → **Actions** で **OBSERVER_TOKEN** を編集する。
2. 値を **一時的に誤ったもの** に変更する（例: 末尾 1 文字を変える）。保存する。
3. **Actions** → **Observer Cron** → **Run workflow** で手動実行する。
4. **Run Observer and save report** が 401 等で失敗し、run が赤になることを確認する。
5. **Slack（または WEBHOOK_URL で設定した通知先）** に、次の内容が含まれた通知が届くことを確認する：
   - 実行日時（UTC）
   - 失敗した step の想定（Run Observer and save report）
   - Actions の Run URL（クリックで該当 run を開ける）
6. 確認後、**OBSERVER_TOKEN** を**正しい値に戻す**（次の cron が成功するようにする）。

WEBHOOK_URL を未設定の場合は通知は届かないが、workflow の失敗通知 step は `continue-on-error: true` のため、run は「Observer 失敗」で終わる。

---

## 12. Phase 3-4 suggested_next scoring の確認

Phase 3-4 のスコアリングがローカルと本番（Vercel）で動いていることを、コピペで確認する。  
docs/28_Observer_SuggestedNext_Scoring.md が SSOT。

### 12.1 ローカル：stdout の suggested_next 確認

1. Next.js を起動する（どちらか一方に合わせる）。

```bash
# ターミナル1: Next.js（3000 または 3001）
npm run dev
```

2. Observer を実行し、stdout の **suggested_next** を確認する。**NEXT_BASE_URL** は Next.js のポートに合わせる。  
   **注意**: すでに `agent/observer` にいる場合は `cd` は不要（リポジトリルートから開いたときだけ `cd agent/observer` する）。

Bash の場合（リポジトリルートから）:

```bash
# ターミナル2: Observer（3000 の場合）
cd agent/observer
export NEXT_BASE_URL=http://localhost:3000
python main.py
```

```bash
# 3001 で Next.js を起動している場合
export NEXT_BASE_URL=http://localhost:3001
python main.py
```

**PowerShell の場合:**

```powershell
# リポジトリルートにいる場合のみ
cd agent/observer

$env:NEXT_BASE_URL = "http://localhost:3000"   # または 3001
python main.py
```

**期待結果**

- JSON に **suggested_next** が含まれる（候補が 0 件のときは `null`）。
- suggested_next が非 null のとき、**next_action** が status に応じた文言（28 §7 のテンプレ）になっている。

### 12.2 ローカル：--save と healthcheck 確認

Observer で保存し、latest 取得 → report_id / summary 一致まで確認する。  
（すでに `agent/observer` にいる場合は `cd` は不要。）

Bash の場合:

```bash
cd agent/observer
export NEXT_BASE_URL=http://localhost:3000   # または 3001
export OBSERVER_TOKEN=あなたのトークン
python main.py --save
```

**PowerShell の場合:**

```powershell
# リポジトリルートにいる場合のみ
cd agent/observer

$env:NEXT_BASE_URL = "http://localhost:3000"   # または 3001
$env:OBSERVER_TOKEN = "あなたのトークン"
python main.py --save
```

**期待結果**

- 標準エラーに `✓ Saved: report_id=...` と `✓ healthcheck passed: report_id and summary match latest` が出ること。
- 保存した report の **report_id** と GET latest の **report_id** が一致し、**summary** も一致していること（main.py の healthcheck がこれを検証している）。

### 12.3 suggested_next.debug が payload に入っていることの確認

latest API から **debug**（total / breakdown / rule_version）が取得できることを確認する。

```bash
# 最新レポートの payload.suggested_next.debug を表示（3000 の場合）
curl -s http://localhost:3000/api/observer/reports/latest | jq '.report.payload.suggested_next.debug'
```

**期待結果**

- suggested_next が非 null のとき、**debug** が存在し、次を満たすこと：
  - **debug.total**: 数値（スコア合計）
  - **debug.breakdown**: オブジェクトで **4 キー** を持つ（`temp`, `stale`, `status_bonus`, `stuck`）
  - **debug.rule_version**: 文字列 **"3-4.0"**
- 候補 0 件で suggested_next が null のときは、debug は存在しない。

例（抜粋）：

```json
{
  "total": 45,
  "breakdown": {
    "temp": 0,
    "stale": 25,
    "status_bonus": 20,
    "stuck": 0
  },
  "rule_version": "3-4.0"
}
```

### 12.4 本番（Vercel）での確認

GitHub Actions の **Observer Cron** を手動実行し、§10 と同様に workflow が緑で完了することを確認する。  
本番では **NEXT_BASE_URL** に Vercel の URL（例: `https://your-app.vercel.app`）が Secrets で設定されている。  
完了後、ダッシュボードの「Observer の提案」で、保存された suggested_next と **debug** の内容が確認できれば Phase 3-4 は本番でも有効。

---

## 13. テスト結果サマリ

| # | テスト | 期待 HTTP | 期待する状態 |
|---|--------|-----------|------------|
| 1 | 正常 Apply | 200 | consumed=true, history に記録 |
| 2 | source=batch | 403 | Apply 拒否 |
| 3 | ai_agent + confirmation なし | 403 | Apply 拒否 |
| 4 | 期限切れ confirmation | 403 | Apply 拒否 |
| 5 | consumed 済み再利用 | 409 | Apply 拒否 |
| 6 | 不正遷移（422） | 422 | consumed=false（未消費） |
| 7 | proposed_change 不一致 | 400 | Apply 拒否 |
| 8 | 掃除関数 | — | 期限切れレコード削除 |
| 9.1 | ObserverReport 認証なし | 401 | unauthorized |
| 9.2 | ObserverReport 認証ありで保存 | 200 | observer_reports に INSERT（source/received_at 含む） |
| 9.3 | ObserverReport 最新取得 | 200 | 最新 1 件を返却 |
| 10 | Actions 手動実行 → healthcheck まで通る | — | report_id 一致・summary 一致で緑。失敗時は exit 1 で赤 |
| 11 | 意図的にトークン壊して失敗 → 通知 | — | run が赤。Slack 等に実行日時・step・Run URL の通知が届く |
| 12.1 | Phase 3-4 ローカル stdout | — | suggested_next が JSON に含まれる。next_action がテンプレ通り |
| 12.2 | Phase 3-4 --save → healthcheck | — | ✓ Saved と ✓ healthcheck passed が表示される |
| 12.3 | suggested_next.debug 確認 | 200 | latest の payload.suggested_next.debug に total / breakdown（4キー）/ rule_version=3-4.0 |
| 12.4 | Phase 3-4 本番（Actions 手動） | — | workflow 緑。ダッシュボードで suggested_next と debug が確認できる |