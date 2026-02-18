# 140 — ローカル開発環境セットアップ

並行開発・新規参加者向け。環境変数・Supabase・マイグレーション・Cron のローカル確認を 1 本にまとめる。

---

## 1. 前提

- Node.js 18+（推奨: 20 以上）
- npm（または yarn / pnpm）

---

## 2. リポジトリと依存関係

```bash
git clone <repo>
cd context-os
npm install
```

---

## 3. 環境変数（.env.local）

`src/app/api` および `src/lib` が参照する変数（実装の `process.env.*` 参照に基づく）。**本番の Supabase / API キーをそのまま使うか、別プロジェクトを用意する。** 変数を追加した場合は本節と [146_parallel_dev_rules.md](146_parallel_dev_rules.md) に従い本ドキュメントを更新する。

| 変数名 | 必須 | 説明 |
|--------|------|------|
| NEXT_PUBLIC_SUPABASE_URL | ○ | Supabase プロジェクト URL |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | ○ | 公開 anon key（ブラウザ用） |
| SUPABASE_SERVICE_ROLE_KEY | ○ | Service role key（サーバー専用・RLS バイパス可） |
| OPENAI_API_KEY | ○ | Organizer / Advisor / Observer / proposal-quality 用 |
| CRON_SECRET | △ | 繰り返しジョブ用。ローカルで `/api/recurring/run` を叩くとき 16 文字以上の Bearer を設定 |
| OBSERVER_TOKEN | △ | Observer レポート送信・latest の Bearer 認証。CI/スモークで使うなら設定 |

`.env.local` は git に含めない（.gitignore 済み）。

---

## 4. 開発サーバー

```bash
npm run dev
```

- ブラウザ: http://localhost:3000
- WSL 等から触る場合: `npm run dev:open`（0.0.0.0 でバインド）

その他:

- `npm run build` — 本番ビルド
- `npm run lint` — ESLint
- `npm test` — Vitest 一括実行
- `npm run test:watch` — ウォッチ

---

## 5. テストの範囲とファイル対応

単体テストは Vitest。テストファイルはソースと同じディレクトリに `*.test.ts` で配置する。

| テストファイル | カバーする機能 |
|----------------|----------------|
| src/lib/dashboardTree.test.ts | ツリー構築・子関係・階層 |
| src/lib/phase5Diff/validator.test.ts | Diff バリデーション（relations/grouping/decomposition） |
| src/lib/phase5Diff/transform.test.ts | Organizer 提案の DB 操作への変換 |
| src/lib/proposalQuality/validator.test.ts | 提案品質バリデーション |
| src/app/api/tree/move/validate.test.ts | ツリー移動のバリデーション |

並行で API や lib を変更したときは、上記の該当テストを実行してから PR する。一括実行は `npm test`。

---

## 6. Supabase（DB）

- **通常**: リモートの Supabase プロジェクトをそのまま使う（NEXT_PUBLIC_* と SERVICE_ROLE_KEY をそのプロジェクトの値に設定）。
- **ローカル Supabase**: 使う場合は `supabase start` 等でローカルを立ち上げ、`.env.local` の URL/KEY をローカル用に差し替える。マイグレーションは `supabase db reset` または `supabase migration up` で適用。

---

## 7. マイグレーションの適用

- **リモート**: Supabase Dashboard → SQL Editor で `supabase/migrations/*.sql` を順に実行するか、`supabase db push`（CLI 連携時）で適用。
- **検証用 SQL**: `scripts/verify-auth-db.sql` で nodes の user_id NOT NULL と RLS 有効を確認できる。詳細は [134_auth_rls_verification_checklist.md](134_auth_rls_verification_checklist.md)。

---

## 8. 繰り返しジョブ（Cron）のローカル確認

本番では Vercel Cron が `0 21 * * *`（UTC）で GET /api/recurring/run を呼ぶ。ローカルで同じ処理を試すには:

1. `.env.local` に `CRON_SECRET=<16 文字以上の文字列>` を設定する。
2. 次のいずれかで呼ぶ。

```bash
# GET（Vercel と同様）
curl -H "Authorization: Bearer あなたのCRON_SECRET" "http://localhost:3000/api/recurring/run"

# POST
curl -X POST -H "Authorization: Bearer あなたのCRON_SECRET" "http://localhost:3000/api/recurring/run"
```

- 401 になる場合は CRON_SECRET の一致を確認。
- 実行結果は DB の `run_history`（rule_id = NULL の行）と `nodes` で確認。運用詳細は [137_recurring_run_history_and_operations.md](137_recurring_run_history_and_operations.md)。

---

## 9. 認証（ログイン）の確認

- ダッシュボードは `/dashboard` で保護されており、未ログインは `/login` にリダイレクトされる。
- Supabase Auth の設定（メール/マジックリンク等）は Supabase Dashboard で行う。認証・RLS の検証手順は [134_auth_rls_verification_checklist.md](134_auth_rls_verification_checklist.md)。

---

## 10. ルート保護の実装の所在

- **src/proxy.ts**: `/dashboard` および `/dashboard/*` は未認証で `/login` へ、`/login` は認証済みで `/dashboard` へリダイレクトするロジックを定義している。
- **現状**: Next の middleware として `proxy` を登録する **middleware.ts（または src/middleware.ts）がリポジトリに存在しない**。そのため、サーバー側でのリダイレクトは未適用の可能性がある。未認証時は各 API の `getSupabaseAndUser()` が 401 を返し、クライアント側でエラーとなる。
- サーバー側で確実に保護するには、`src/middleware.ts` を追加し `export { proxy as default } from "@/proxy";` のように `proxy` を default export する構成にするとよい。実装変更時は本節と [134_auth_rls_verification_checklist.md](134_auth_rls_verification_checklist.md) を整合させること。

---

## 11. 関連ドキュメント

- 全体・コマンド・アーキテクチャ: リポジトリ直下 [CLAUDE.md](../CLAUDE.md)
- API 一覧: [139_api_routes_index.md](139_api_routes_index.md)
- デプロイ・Cron 不調: [136_vercel_push_deploy_checklist.md](136_vercel_push_deploy_checklist.md)、[138_vercel_cron_troubleshooting.md](138_vercel_cron_troubleshooting.md)
