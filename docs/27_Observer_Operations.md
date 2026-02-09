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

### 2.1 Actions のログを見る

1. GitHub リポジトリ → **Actions** タブ
2. **Observer Cron** ワークフローを選択
3. 失敗した run を開き、**Run Observer and save report** ステップのログを確認（Phase 3-2.1 ではこの中で「保存 → GET latest → report_id / summary 一致」の healthcheck まで行う）

### 2.2 よくある失敗と切り分け

| 現象 | 想定原因 | 確認・対処 |
|------|----------|------------|
| **401 Unauthorized** | トークン不一致 or 未設定 | Secrets の `OBSERVER_TOKEN` と Vercel の「Environment Variables」の `OBSERVER_TOKEN` が同一か確認。先頭・末尾の空白や改行に注意。 |
| **500 / connection error** | API の URL 誤り or Vercel 側の設定不備 | `NEXT_BASE_URL` が `https://<your-app>.vercel.app` の形で、末尾スラッシュなしで設定されているか確認。Vercel で OBSERVER_TOKEN が設定されているか確認。 |
| **Timeout** | ノード数が多い or ネット遅延 | まずは 1 時間ごとの頻度のまま運用。必要なら `agent/observer` 側の httpx タイムアウトを延長する。 |
| **pip install 失敗** | requirements.txt の依存問題 | ローカルで `pip install -r agent/observer/requirements.txt` が通るか確認。 |

401 のときは「認証まわり」、500 や接続エラーのときは「URL・Vercel 設定・ネット」を疑う。

---

## 3. Secrets 設定手順

GitHub リポジトリの **Settings → Secrets and variables → Actions** で以下を登録する。

| Secret 名 | 説明 | 例 |
|-----------|------|-----|
| **NEXT_BASE_URL** | Vercel の Next.js API のベース URL（末尾スラッシュなし）。SSOT はこの名前（main.py / workflow で統一） | `https://context-os.vercel.app` |
| **OBSERVER_TOKEN** | Phase 3-1 で設定した Bearer token（長いランダム文字列） | （Vercel の環境変数 OBSERVER_TOKEN と同一） |

- **直書き禁止**: workflow ファイルにトークンや URL を書かない。
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

## 6. この文書の位置づけ

- Observer の **定期実行・運用** の SSOT
- 26_Agent_Observer_MVP.md の「保存」「認証」の先にある「どこで・どう回すか」を補足する
