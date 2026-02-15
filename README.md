This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Database (Supabase)

- **nodes.user_id NOT NULL への移行**: マイグレーション `supabase/migrations/20260213_nodes_user_id_not_null.sql` が、NULL 行を最初のユーザーに割り当ててから NOT NULL を付与する。RLS のため通常セッションでは `user_id IS NULL` の行は見えず 0 件に見えることがあるが、マイグレーション内で補正する。開発で NULL 行を削除したい場合は、マイグレーション前に RLS をバイパスする権限で `DELETE FROM public.nodes WHERE user_id IS NULL;` を実行する。
- **認証・RLS の最終検証**: DB 確認用 SQL とアプリレベル検証手順は [docs/134_auth_rls_verification_checklist.md](docs/134_auth_rls_verification_checklist.md) にあり、`scripts/verify-auth-db.sql` で 1-1〜1-3 を一括実行できる。

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
