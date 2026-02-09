# 27_Observer_Operations.md
## Observer 運用ガイド（Phase 3-2：GitHub Actions 定期実行）

---

## 0. この文書の目的

Python Observer（`agent/observer/main.py --save`）を **定期実行** し、  
Vercel 上の `POST /api/observer/reports` に安全に保存し続けるための運用手順をまとめる。

- **実行環境**: GitHub Actions（cron）
- **方針**: Vercel には Python を載せない。Observer は「外部ジョブ」として回す。

---

## 1. どこで動くか（なぜ GitHub Actions か）

| 項目 | 説明 |
|------|------|
| 実行場所 | GitHub Actions（`ubuntu-latest`） |
| 理由 | 最小運用で始められる。Vercel に Python ランタイムを載せず、Observer はリポジトリから checkout して pip install し実行するだけ。 |
| トリガー | 1) **cron**（デフォルト 1 時間ごと） 2) **workflow_dispatch**（手動実行） |

Vercel 上では Next.js API だけが動き、Observer のコードはデプロイしない。

---

## 2. 失敗時の確認方法

### 2.1 ログの見方（Actions）

1. GitHub リポジトリ → **Actions** タブ
2. 左メニューで **Observer Cron** を選択
3. 一覧から **失敗した run**（赤い ×）または **成功した run**（緑の ✓）をクリック
4. **Run Observer and save report** というステップをクリックしてログを開く

**ログで見る場所**

- 成功時: ログの末尾付近に **`✓ Saved: report_id=...`** と **`✓ healthcheck passed: report_id and summary match latest`** の 2 行が出ていれば Phase 3-2.1 の保存と healthcheck まで成功している。
- 失敗時: ステップ内の **赤いエラーメッセージ** が 1 行で出る（Phase 3-4.3 以降は `BASE_URL=... , 呼び出し先: ... HTTP 401 — ...` のような形式）。その 1 行で「接続できない／401／500／timeout」を判定する。

### 2.2 典型原因とログの対応（401 / 500 / timeout）

| 現象 | ログにどう出るか | 想定原因 | 確認・対処 |
|------|------------------|----------|------------|
| **401 Unauthorized** | `... 呼び出し先: POST .../api/observer/reports HTTP 401 — unauthorized` のような 1 行 | トークン不一致 or 未設定 | **Secrets** の `OBSERVER_TOKEN` と **Vercel** の「Environment Variables」の `OBSERVER_TOKEN` を **完全に同じ** にする。先頭・末尾の空白や改行を入れていないか確認。 |
| **500 / connection error** | `HTTP 500 — ...` や `接続できません。NEXT_BASE_URL を確認してください。` | API の URL 誤り or Vercel 側の設定不備 | **NEXT_BASE_URL** が `https://context-os-five.vercel.app` の形で、末尾スラッシュなしか確認。Vercel で **OBSERVER_TOKEN** が設定されているか確認。本番アプリがデプロイ済みで稼働しているか確認。 |
| **Timeout** | `ReadTimeout` や長時間待ったあとのエラー | ノード数が多い or ネット遅延 | まずは 1 時間ごとの頻度のまま運用。必要なら `agent/observer/main.py` の httpx タイムアウトを延長する。 |

**切り分けの目安**

- ログに **HTTP 401** が出る → 認証まわり（OBSERVER_TOKEN の一致を最優先で確認）。
- ログに **接続できません** や **HTTP 500** が出る → URL・Vercel の設定・デプロイ状態を確認。
- ログに **Timeout** が出る → 負荷やネット。頻度を落とすかタイムアウトを伸ばす。

### 2.3 その他の失敗

| 現象 | 確認・対処 |
|------|------------|
| **pip install 失敗** | ローカルで `pip install -r agent/observer/requirements.txt` が通るか確認。 |
| **healthcheck failed: report_id mismatch** | 保存直後に別のレポートが書き込まれた可能性。手動で再実行して再現するか確認。 |
| **healthcheck failed: summary mismatch** | 保存と latest の payload が一致していない。API や DB の不整合を疑う。 |

---

## 3. Secrets 設定手順

GitHub リポジトリの **Settings → Secrets and variables → Actions** で以下を登録する。

### 3.1 初心者向け：本番で動かすための 2 つの Secret を追加する（Phase 3-2.1）

Observer Cron を **本番（Vercel）** で動かすには、次の **2 つ** を必ず設定する。

| Secret 名 | 設定する値 | どこで同じ値を使うか |
|-----------|-------------|----------------------|
| **NEXT_BASE_URL** | `https://context-os-five.vercel.app` | 本番の Next.js の URL。末尾の `/` は付けない。 |
| **OBSERVER_TOKEN** | （長いランダム文字列） | **Vercel の Environment Variables の OBSERVER_TOKEN とまったく同じ値** をコピーして使う。 |

**手順（NEXT_BASE_URL）**

1. GitHub でリポジトリを開く → **Settings**（リポジトリの設定）
2. 左メニュー **Secrets and variables** → **Actions**
3. **New repository secret** をクリック
4. **Name** に `NEXT_BASE_URL` と入力
5. **Secret** に `https://context-os-five.vercel.app` と入力（コピペでよい）
6. **Add secret** をクリック

**手順（OBSERVER_TOKEN）**

1. 先に **Vercel** で値を確認する  
   - Vercel のプロジェクト → **Settings** → **Environment Variables**  
   - **OBSERVER_TOKEN** の値を表示（または新規に生成した長いランダム文字列を用意）
2. GitHub の **Settings → Secrets and variables → Actions** で **New repository secret**
3. **Name** に `OBSERVER_TOKEN` と入力
4. **Secret** に、Vercel の OBSERVER_TOKEN と **同じ値** を貼り付ける（先頭・末尾の空白や改行を入れない）
5. **Add secret** をクリック

**重要**: GitHub の **OBSERVER_TOKEN** と Vercel の **OBSERVER_TOKEN** が 1 文字でも違うと、Actions 実行時に **401 Unauthorized** になる。必ず同じ値にする。

---

| Secret 名 | 説明 | 例 |
|-----------|------|-----|
| **NEXT_BASE_URL** | Vercel の Next.js API のベース URL（末尾スラッシュなし）。`https://` を省略すると main.py が自動で付与する | `https://context-os-five.vercel.app` |
| **OBSERVER_TOKEN** | Phase 3-1 で設定した Bearer token（長いランダム文字列） | （Vercel の環境変数 OBSERVER_TOKEN と同一） |
| **WEBHOOK_URL** | Phase 3-3（Slack 用）：失敗通知。Slack Incoming Webhook の URL。Slack を使う場合のみ | `https://hooks.slack.com/services/...` |
| **CHATWORK_API_TOKEN** | Phase 3-3（ChatWork 用）：失敗通知。ChatWork API トークン。ChatWork を使う場合のみ | （ChatWork の API トークン） |
| **CHATWORK_ROOM_ID** | Phase 3-3（ChatWork 用）：通知先ルーム ID。CHATWORK_API_TOKEN とセットで設定 | （数値のルーム ID） |

- **直書き禁止**: workflow ファイルにトークンや URL を書かない。
- **失敗通知**: Slack なら **WEBHOOK_URL** のみ。ChatWork なら **CHATWORK_API_TOKEN** と **CHATWORK_ROOM_ID** の両方を設定する。両方設定した場合は両方に送信される。
- **OBSERVER_TOKEN**: 必ず Secrets で渡す。GitHub がログ内をマスクするが、意図的に echo しないこと。

Vercel 側（Environment Variables）にも同じ `OBSERVER_TOKEN` を設定しておく（POST /api/observer/reports の検証用）。

---

## 4. 実行頻度の推奨

| 段階 | cron 例 | 説明 |
|------|----------|------|
| 最初 | `0 * * * *`（1 時間ごと） | 負荷と API 制限を気にせず様子を見る。 |
| 慣れたら | `*/15 * * * *`（15 分ごと） | 必要に応じて workflow の `schedule` を変更。 |

変更する場合は `.github/workflows/observer_cron.yml` の `schedule` を編集する。

---

## 5. 手動実行手順（workflow_dispatch）

1. GitHub リポジトリ → **Actions**
2. 左メニューで **Observer Cron** を選択
3. 右側の **Run workflow** をクリック
4. ブランチを選び **Run workflow** で実行

数分以内に「Run Observer and save report」が成功すれば、Vercel の `/api/observer/reports/latest` に最新レポートが反映される。ダッシュボード（`/dashboard`）の「Observer の提案」パネルで確認できる。

---

## 6. 失敗通知（Phase 3-3）

Observer Cron のいずれかの step が失敗したとき、**Slack（または ChatWork）** に webhook で通知する。

### 6.1 通知設定

**Slack の場合**

1. Slack アプリの **Incoming Webhooks** を有効にし、通知先チャンネル用の Webhook URL を発行する。
2. GitHub Secrets に **WEBHOOK_URL** を追加し、その URL を設定する。

**ChatWork の場合**

1. ChatWork にログイン → **設定** → **API** で **API トークン** を発行する。
2. 通知先のルームを開き、URL の `room_id=12345678` の部分から **ルーム ID** を確認する（数値のみ）。
3. GitHub Secrets に **CHATWORK_API_TOKEN**（トークン）と **CHATWORK_ROOM_ID**（ルーム ID）を追加する。両方必須。

通知内容は **実行日時（UTC）**・**失敗した step の想定**・**Actions の Run URL** を含む。Slack / ChatWork どちらも未設定の場合は通知は送られない（workflow の失敗自体には影響しない）。

### 6.2 テスト方法

- **意図的に失敗させる**: GitHub Secrets の **OBSERVER_TOKEN** を一時的に誤った値（1 文字変える等）に変更し、Observer Cron を手動実行する。失敗後に Slack（WEBHOOK_URL 設定時）または ChatWork（CHATWORK_* 設定時）に通知が届くことを確認する。
- 確認後、**OBSERVER_TOKEN** を正しい値に戻す。
- 通知内容に「実行日時」「失敗した step（想定）」「Run URL」が含まれていることを確認する。

---

## 7. Phase 3-4 の確認方法（Actions で新ロジックが動いているか）

GitHub Actions の Observer Cron が **Phase 3-4 のスコアリング**（docs/28）で動いていることを、latest API の **payload.suggested_next.debug.rule_version** で確認する。

### 7.1 手順

1. **Actions** → **Observer Cron** → **Run workflow** で手動実行する。
2. workflow が緑で完了するまで待つ。
3. 本番のベース URL（例: `https://your-app.vercel.app`）に向けて **GET /api/observer/reports/latest** を実行し、レスポンスに **debug.rule_version** が含まれるか確認する。

### 7.2 curl で確認する（jq あり）

`YOUR_VERCEL_URL` を Vercel の URL（例: `https://context-os-five.vercel.app`）に置き換える。

```bash
curl -s "https://YOUR_VERCEL_URL/api/observer/reports/latest" | jq '.report.payload.suggested_next.debug'
```

**期待結果**

- suggested_next が非 null のとき: **rule_version** が **"3-4.0"** であること。**total**（数値）と **breakdown**（temp / stale / status_bonus / stuck の 4 キー）も含まれること。
- suggested_next が null のとき（候補 0 件）: `debug` は存在しない。`jq` は `null` を返す。

例（抜粋）:

```json
{
  "total": 20,
  "breakdown": { "temp": 0, "stale": 0, "status_bonus": 20, "stuck": 0 },
  "rule_version": "3-4.0"
}
```

### 7.3 curl のみ（jq が無い場合）

レスポンス全体を表示し、目視で `"rule_version":"3-4.0"` を探す。

```bash
curl -s "https://YOUR_VERCEL_URL/api/observer/reports/latest"
```

**期待結果**

- `"ok":true` かつ `"report"` が null でないこと。
- `report.payload.suggested_next` が存在する場合、その中に **"rule_version":"3-4.0"** の文字列が含まれること。
- Windows の PowerShell では `curl` の代わりに `Invoke-RestMethod` も使える（`Invoke-RestMethod -Uri "https://YOUR_VERCEL_URL/api/observer/reports/latest"`）。出力から `rule_version` を目視で確認する。

---

## 8. この文書の位置づけ

- Observer の **定期実行・運用・失敗通知** の SSOT
- 26_Agent_Observer_MVP.md の「保存」「認証」の先にある「どこで・どう回すか」を補足する
