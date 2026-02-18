# 繰り返しタスクの実行履歴と運用

本ドキュメントは、繰り返しタスクの実行履歴（run_history）・二重実行防止・診断・Cron 確認手順をまとめる。基本的な Cron 設定は [135_recurring_cron_setup.md](135_recurring_cron_setup.md) を参照。

## 1. run_history テーブル

実行のたびに 1 行ずつ挿入され、「いつ・どのルールで・手動か自動か」を追える。

| カラム | 型 | 意味 |
|--------|-----|------|
| id | UUID | 主キー |
| rule_id | UUID NULL | ルール ID。**NULL のときはジョブ実行そのものの記録**（Cron が 1 回動いたことを表す）。 |
| run_at | TIMESTAMPTZ | 実行した日時 |
| run_for_date | DATE NULL | 対象日（JST）。clear 時は NULL。 |
| trigger | TEXT | `cron` / `manual` / `clear` |
| created_node_id | UUID NULL | 挿入した nodes.id（実行時のみ。clear 時は NULL） |
| processed_count | INT NULL | **ジョブ実行時のみ**。処理したルール数。 |
| created_count | INT NULL | **ジョブ実行時のみ**。実際に挿入した件数。 |

- **ルール単位の実行**: タスクを 1 件挿入したときに `rule_id` を設定して 1 行 insert。
- **ジョブ実行**: Cron が `/api/recurring/run` を呼んだとき、**必ず** `rule_id = NULL` で 1 行 insert する（タスクが 0 件でも 1 件でも 1 行残る）。これで「ジョブが動いたか」「何件処理・何件生成したか」が分かる。

## 2. recurring_rules の last_run_at / last_run_for_date

- **last_run_at**: 最後に実行した日時（実時刻）。UI の「最後に実行」表示に使用。
- **last_run_for_date**: 最後に実行した「対象日」（JST の日付）。**二重実行防止**に使用。

「その日分は 1 回だけ」を守るため、実行時に `last_run_for_date = 今日(JST)` に更新する。同一日に手動と Cron の両方が動いても、先に更新したほうだけがノードを挿入し、もう一方は 0 行更新でスキップする。

条件付き UPDATE は、Supabase の `.or()` が UPDATE で期待どおり動かない環境があるため、**last_run_for_date が NULL のとき**と**last_run_for_date が今日より前のとき**を別々に試して 1 行だけ更新する実装にしている。

## 3. 実行履歴クリア

「実行履歴クリア」ボタンで以下を行う。

- `last_run_at` / `last_run_for_date` を **NULL** に更新。
- **next_run_at を「今日」に戻す**（`getTodayJSTAtUTC(todayJST, time_of_day)` で算出）。  
  これにより、クリア直後に「今すぐ実行」またはジョブで、その日分のタスクを再度 1 件生成できる（誤削除で追加し直したいときの受け皿）。
- run_history に `trigger = 'clear'` で 1 行挿入し、誰が・いつ・どのルールをクリアしたかを残す。

## 4. 診断・実行ログ（UI）

繰り返しページで「今すぐ実行」を実行すると、以下が表示される。

- **診断**: 今日(JST)、終了時刻(UTC)、有効なルール数、次回実行時刻が今日以内の数、今日分未実行で対象の数。
- **スキップ理由**: 対象ルールごとに `skipReason` を表示。  
  - `next_run_date_future`: 次回実行日(JST)が今日より先  
  - `already_run_today`: 今日分は実行済み  
  - `end_at_exceeded`: 終了日を超過  
  - `before_start`: 開始日前  

**実行ログ**セクションで、run_history の直近を一覧表示（実行日時、ルール/ジョブ、種別＝自動・手動・クリア、対象日、処理数、生成数）。「ジョブ」かつ「種別: 自動」の行が、Cron が実行されたことを示す。

## 5. Cron が動いたかの確認

1. **run_history**: `rule_id` が **NULL** で `trigger = 'cron'` の行が、該当時刻付近にあるか。あればジョブは実行されている（processed_count / created_count で中身を確認可能）。
2. **Vercel**: プロジェクト → **Cron Jobs** タブで、該当 Cron の実行履歴に 1 件あるか。**Logs** タブでは Request Path を `/api/recurring/run` に絞ると、その時刻にリクエストがあったか・Status 200 か 401 かが分かる。

run_history にジョブの行が 1 件もない場合は、その時刻に API が正常終了していない（Vercel が Cron を発火していないか、認証失敗などで途中で終了している）。詳細は [138_vercel_cron_troubleshooting.md](138_vercel_cron_troubleshooting.md) を参照。

## 6. Vercel Cron の時刻（UTC と JST）

Vercel の Cron は **すべて UTC**。画面に「08:00 PM」と出ていても、それは **UTC 20:00** を意味する。

- **UTC 20:00** = **日本時間 翌朝 05:00**（JST = UTC+9）
- **UTC 21:00** = **日本時間 翌朝 06:00**

vercel.json の `schedule` と JST の対応例:

| 実行したい時刻（JST） | cron（UTC） |
|----------------------|-------------|
| 朝 5:00 | `0 20 * * *` |
| 朝 6:00 | `0 21 * * *` |
| 朝 3:00 | `0 18 * * *` |

環境変数変更後は本番の再デプロイが必要。135 の「0時にタスクが生まれないとき」も参照。
