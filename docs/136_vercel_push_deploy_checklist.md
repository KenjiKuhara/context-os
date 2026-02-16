# Push でデプロイされなくなったときの確認リスト

push しても Vercel にデプロイが作成されない場合、以下を順に確認してください。

## ログイン / Supabase Auth を入れたあとにデプロイされなくなった場合

**Supabase Auth / ログイン機能の追加そのものは「push でデプロイが作られなくなる」直接原因にはなりません。** デプロイが「作られるか」は、GitHub が push を検知して Vercel に webhook を送り、Vercel がデプロイを 1 件作ると判断する段階で決まります。その時点ではまだコードはビルドされておらず、middleware/proxy や getSupabaseAndUser、Cookie は実行されません。同じ時期に、Supabase の Vercel 連携の設定変更や GitHub の Vercel アプリ再認証をしていないか思い出し、下記の確認 1〜4 を優先してください。その後、この文書の「1. Vercel の Git 接続」以降をそのまま実行してください。

## 1. Vercel の Git 接続（いちばん多い原因）

- **Vercel ダッシュボード** → 該当プロジェクト → **Settings** → **Git**
- **Connected Git Repository** に正しいリポジトリ（例: `your-org/context-os`）が表示されているか。
- 表示されていない、または「Disconnect」しかない → **Connect Git Repository** で再度リポジトリを接続する。
- 接続済みなら、**Production Branch** を確認する。ここに書かれたブランチ（多くは `main` または `master`）への push だけが Production デプロイのトリガーになる。**自分が push しているブランチ名と一致しているか**を確認する。

## 2. GitHub 側の Vercel 権限

- **GitHub** → リポジトリの **Settings** → **Integrations** → **Applications**（または **Installed GitHub Apps**）
- **Vercel** がインストールされており、**このリポジトリ** にアクセスできるようになっているか確認する。
- リポジトリを別 Organization に移した・新規で作った場合、Vercel の「Repository access」でそのリポジトリが選ばれていないと、push が Vercel に届かない。

## 3. Vercel でデプロイが止まっていないか

- プロジェクト **Settings** の **General** などで、**Deployments** が Paused や Disabled になっていないか確認する。
- **Deployments** タブで、手動の「Redeploy」は動くか試す。Redeploy は動くが push で増えない場合は、上記 1・2 の Git 連携を疑う。

## 4. ブランチ名の一致

- ローカルで `git branch` や `git push origin main` のブランチ名と、Vercel の **Production Branch** が同じか確認する。
- 例: Vercel が `main` を Production にしているのに、ずっと `develop` にだけ push していると、Production のデプロイは作られない（Preview は作られる場合あり）。

## 5. このリポジトリの設定について

- `vercel.json` には **crons** のみ定義されており、Git のトリガーを無効にする設定はありません。
- Node.js バージョン（24.x / 22.x）や Build Machine は「デプロイが**起動するかどうか**」には影響しません。push でデプロイが**作られない**場合は、上記 1〜4 を優先して確認してください。

## まとめ

| 確認項目 | 確認場所 |
|----------|-----------|
| Git 接続・Production Branch | Vercel → プロジェクト → Settings → Git |
| Vercel のリポジトリアクセス | GitHub → リポジトリ Settings → Integrations / Installed GitHub Apps |
| デプロイ停止設定 | Vercel → プロジェクト → Settings → General 等 |
| push しているブランチ | ローカル `git branch` と Vercel の Production Branch の一致 |

これらを確認しても push でデプロイが作られない場合は、Vercel の **Deploy Hooks** で URL を発行し、手動でその URL を叩いてデプロイが走るか試すと、Vercel 側のビルド環境は問題ないか切り分けできます。
