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
| **healthcheck failed: --strict and payload has warnings** | latest の payload.warnings が 1 件以上。COUNT_MISMATCH / SUMMARY_MISMATCH 等。仕様のズレ or バグの可能性があるので docs/29 を参照し調査する。 |

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

### 5.1 通常運用は --save --strict を使う（Phase 3-4.5）

cron および手動実行では **`python3 agent/observer/main.py --save --strict`** を使う。

- **--strict** を付けると、保存した直後に GET latest で **payload.warnings** を確認し、**1 件以上あれば exit(1)** する。
- これにより「warnings が出たら GitHub Actions が赤になる」状態になり、異常が埋もれない。
- warnings が出た場合は **仕様のズレ or バグ** の可能性があるので、ログの `⚠ Observer report has warnings:` と各 code / message / details を確認し、調査する。  
  詳細は **docs/29_Observer_Warnings.md** を参照。

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

## 8. 鮮度の見方（Phase 3-4.7）

運用者が毎回確認するのは次の **2 つ** でよい。

1. **最終観測** — メタ行の「最終観測：たった今 / N分前 / N時間前 / N日以上前」。提案が「いつ時点の観測か」を示す。
2. **warnings** — 「Observer が異常を検知しました」ブロック。COUNT_MISMATCH / SUMMARY_MISMATCH 等。**--strict 時は 1 件でもあれば Actions が失敗（exit 1）** する。

**「⚠ 少し古い提案です」** は **warnings ではない**。60 分以上経過した提案に薄く表示される「注意書き」であり、**strict の失敗条件には含まれない**。  
鮮度は「人が古さを把握するため」の表示のみで、判断ロジックには使わない。詳細は **docs/31_Observer_Freshness.md** を参照。

---

## 9. 失敗と「止まる」の設計思想（Phase 3-5）

Observer Cron の run が**失敗（赤）になること**は、異常を検知するための設計であり、「壊れた」ことを意味しない。運用者が「何を見て、どう判断するか」を以下に固定する。

### 9.1 いつ cron（run）が止まるのか

**止まる**＝その回の run が **exit(1)** または step 失敗で **赤** になること。cron 自体は「止まらない」— 次のスケジュール時刻に再度 run が走る。

| 原因 | いつ止まるか | 備考 |
|------|--------------|------|
| **--strict** | 保存直後の healthcheck で、latest の **payload.warnings** が 1 件以上のとき | 仕様ズレ検知。次の run も同じ条件なら再び赤。 |
| **healthcheck** | report_id 不一致 or summary 不一致 | 保存と GET latest の不整合。まれ。 |
| **401** | POST /api/observer/reports が 401 を返したとき | トークン不一致。Secrets と Vercel の OBSERVER_TOKEN を確認。 |
| **500 / 接続エラー** | API が 500 や接続不可のとき | NEXT_BASE_URL や Vercel の状態を確認。 |
| **Timeout** | httpx がタイムアウトしたとき | ノード数・ネット状況。頻度を落とすかタイムアウト延長を検討。 |
| **pip / Python** | 依存インストールやスクリプト実行が失敗したとき | リポジトリの変更や環境を確認。 |

いずれも **「その回の run が失敗する」** だけで、cron スケジュールは継続する。意図的に **cron を止めたい** 場合は、workflow の `schedule` をコメントアウトするか、workflow_dispatch のみに変更する。

### 9.2 warnings が出たときの人の判断フロー

1. **Actions で run が赤** → ログの「Run Observer and save report」を開く。
2. **`healthcheck failed: --strict and payload has warnings`** が出ているか確認。
3. **stderr の `⚠ Observer report has warnings:`** 以下に、code（COUNT_MISMATCH / SUMMARY_MISMATCH 等）と message / details が出ている。
4. **判断**:
   - **仕様のズレ**（例: summary の件数表記と node_count の数え方が食い違った）→ 19 / 29 の仕様と実装を突き合わせて修正する。
   - **バグ**（集計ミスや正規表現の誤り）→ main.py を修正し、コミット・デプロイ後に手動で再実行して緑になるか確認。
   - **一時的なデータ不整合**（例: 観測中に Node が別プロセスで更新された）→ 再実行で解消するか確認。続く場合は仕様・競合を検討。
5. **対応後**: 手動で「Run workflow」を実行し、緑になることを確認。連続失敗時は **docs/32** の「連続失敗時の対応方針」も参照。

### 9.3 「止まる＝壊れた」ではない

- **run が赤になること**は、**「異常を検知した」というシグナル**であり、設計どおりの挙動である。
- **--strict** は「warnings を無視して保存し続ける」ことを防ぎ、**仕様ズレやバグを早期に気づく**ための仕組みである。
- 運用の目的は「**静かに・安全に・止められる**」こと。  
  「止まる」＝「次に何をすべきかが分かる状態」であり、**止めたままにしておく選択**（cron を止める）も運用として許容する。  
  詳細な到達点とやっていないことは **docs/32_Observer_Production_Ready.md** を参照。

---

## 10. この文書の位置づけ

- Observer の **定期実行・運用・失敗通知・失敗時の判断** の SSOT
- 26_Agent_Observer_MVP.md の「保存」「認証」の先にある「どこで・どう回すか」を補足する
- 32_Observer_Production_Ready.md は「本番で静かに・安全に・止められる」到達点と言語化のまとめ
