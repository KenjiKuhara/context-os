# Vercel Cron が動かないときの確認手順

手動の「今すぐ実行」ではタスクが生成されるが、指定時刻に自動実行されない場合の切り分けと確認手順。

## 前提

- **手動で動く** ＝ API と DB の処理は正常。問題は「Vercel がその時刻に Cron を呼んでいない」か「呼んだが認証などで失敗している」のどちらか。
- 繰り返しジョブが **1 回でも正常終了**していれば、必ず run_history に **rule_id = NULL** の行が 1 件入る。この行がなければ、その時刻には API が正常終了していない。

## 確認手順（優先度順）

### 1. run_history でジョブ実行の有無を確認

- **Supabase** → テーブル **run_history** を開く。
- **rule_id が NULL** かつ **trigger = 'cron'** の行が、期待した日時付近にあるか確認する。
- **ある**: ジョブは実行されている。タスクが 0 件なら「今日分は実行済み」などの条件でスキップされた可能性。診断・processed_count / created_count を確認。
- **ない**: その時刻に API が正常終了していない。以下 2〜4 を確認。

### 2. Vercel の Cron Jobs タブ

- プロジェクト → **Cron Jobs** タブ（Logs とは別のタブ）を開く。
- `/api/recurring/run` の Cron の **実行履歴**に、該当日時の 1 件があるか確認する。
- **ない**: Vercel がその時刻に Cron を発火していない。Hobby の制約・設定の見直し。**ある**: 発火はしているので、次は Logs で API の結果を確認。

### 3. Vercel の Logs

- **Logs** タブで、**Request Path** を `/api/recurring/run` に絞る（または検索で `recurring/run`）。
- 該当時刻前後に **GET** でそのパスへのリクエストが 1 件あるか、**Status** が 200 か 401/500 かを確認する。
- **200**: API は成功している。run_history に必ず 1 行入るはずなので、1 で見落としていないか・別環境の DB を見ていないか確認。
- **401**: `CRON_SECRET` の不一致。環境変数とデプロイを確認（下記 4）。
- **500**: サーバーエラー。Logs の詳細や Supabase の接続・RLS を確認。

### 4. 環境変数と再デプロイ

- **Vercel** → プロジェクト → **Settings** → **Environment Variables**
  - `CRON_SECRET`（16 文字以上）が設定されているか。
  - `SUPABASE_SERVICE_ROLE_KEY` が設定されているか。
- 環境変数を追加・変更した場合は **本番の再デプロイ** が必要。値はデプロイ時に取り込まれるため、変更だけでは反映されない。

### 5. Hobby プランの制約

- **Vercel Hobby** では Cron は 1 日 1 回まで。また、実行タイミングに「1 時間の柔軟なウィンドウ」があると案内されている。
- 指定時刻ちょうどではなく、前後数分〜数十分で実行される場合がある。run_history の `run_at` で実際の実行時刻を確認できる。

## まとめ

- **run_history に rule_id = NULL の行がない** → その時刻にジョブは正常終了していない。Cron Jobs タブ・Logs・環境変数・再デプロイを順に確認する。
- 詳細な仕様（run_history の意味、診断、実行履歴クリア、UTC と JST）は [137_recurring_run_history_and_operations.md](137_recurring_run_history_and_operations.md) を参照。
