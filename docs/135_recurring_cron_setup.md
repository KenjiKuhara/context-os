# 繰り返しタスクの自動実行（Cron）設定

## 概要

- ルールに従ったタスク生成は **POST /api/recurring/run**（または GET、Vercel Cron 用）で実行される。
- **誰かがこの API を定期的に呼ばないと、時間が来てもタスクは生成されない。**

## 方法 1: 画面から「今すぐ実行」

- ダッシュボードの「繰り返し」ページに **「今すぐ実行」** ボタンがある。
- クリックすると、**次回実行時刻が「今」より前のルール**だけが処理され、タスクが 1 件ずつ生成される。
- 自動実行の設定をしていない場合や、すぐに 1 回だけ試したいときに使う。

## 方法 2: Vercel Cron（本番の自動実行）

- `vercel.json` で 1 日 1 回（日本標準時 0:00 = UTC 15:00。その日に追加するタスクを朝一でまとめて追加）`/api/recurring/run` を呼ぶように設定済み。
- **Vercel Hobby プラン**では cron は 1 日 1 回まで。それより頻繁な式（例: 15 分ごと）にするとデプロイが失敗する。より頻繁に実行したい場合は **Pro プラン**が必要（[Usage & Pricing for Cron Jobs](https://vercel.com/docs/cron-jobs/usage-and-pricing) 参照）。
- **Vercel にデプロイした環境**で、次を設定する。

### 環境変数（Vercel の Project Settings → Environment Variables）

| 変数名 | 説明 |
|--------|------|
| `CRON_SECRET` | 16 文字以上の秘密文字列。Vercel Cron がこの値を Authorization: Bearer で送る。 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase の service role key（全ユーザー分のルールを処理するため必須）。 |

- `CRON_SECRET` を設定すると、Vercel が cron 実行時に自動でその値を Bearer トークンとして付与する。
- 本番デプロイ後に、Cron Jobs タブで実行履歴を確認できる。

## 方法 3: GitHub Actions など外部 Cron

- 15 分ごとなどで `GET` または `POST` で `https://あなたのドメイン/api/recurring/run` を呼ぶ。
- ヘッダーに `Authorization: Bearer <CRON_SECRET>` を付与する。
- ローカルやオンプレではこの方法で cron を組む。

## 0時にタスクが生まれないとき

- トリガーは **Vercel Cron** のみ（GitHub Actions は不要）。手動で動くならロジックは問題ないので、Cron が動いていないか認証で弾かれている可能性が高い。
- **確認すること（優先度順）**
  1. **Vercel** → プロジェクト → **Settings** → **Environment Variables** に `CRON_SECRET`（16 文字以上）と `SUPABASE_SERVICE_ROLE_KEY` が設定されているか。未設定だと API が 401/500 になり何も実行されない。
  2. 環境変数追加・変更後は **本番の再デプロイ** が必要（値はデプロイ時に取り込まれる）。
  3. **Vercel** → プロジェクト → **Cron Jobs** タブで、JST 0 時（UTC 15:00）以降に実行履歴が出ているか確認する。

## 注意

- **next_run_at は UTC** で比較される。ルールの「時刻」も UTC として解釈される。
- 日本時間で 18:50 にしたい場合は、time_of_day に `09:50`（UTC）を入れるか、将来タイムゾーン対応を入れる必要がある。
