# 145 — リポジトリ構成（Steering）

どこに何を書くかの基準。並行開発時の配置のよりどころ。

---

## ディレクトリ構成

| パス | 役割 |
|------|------|
| src/app/api/ | Next.js API ルート（route.ts）。認証は getSupabaseAndUser または CRON_SECRET / OBSERVER_TOKEN。 |
| src/app/dashboard/ | ダッシュボード関連ページ。 |
| src/app/login/ 等 | 認証・その他ページ。 |
| src/components/ | クライアント用 React コンポーネント。 |
| src/lib/ | ビジネスロジック（stateMachine, dashboardTree, phase5Diff, recurringRun, theme 等）。 |
| src/lib/supabase/ | Supabase クライアント（server / client）。 |
| supabase/migrations/ | SQL マイグレーション。順序はファイル名の日付で管理。 |
| docs/ | 仕様・設計・運用ドキュメント。命名は [00_naming_convention.md](00_naming_convention.md) に従う。 |
| scripts/ | 検証用 SQL 等。 |

## ドキュメントの配置

- **docs/{連番}_{英語スネークケース}.md** — 半角英数字とアンダースコアのみ。
- 番号帯の目安: 00〜20 共通・アーキテクチャ、130〜 運用・API・環境・データモデル・インデックス。一覧は [142_docs_index.md](142_docs_index.md)。

## デプロイの前提

- 本番デプロイは **Production Branch**（例: main / master）への push でトリガーされる。詳細と「push してもデプロイされない」ときの確認は [136_vercel_push_deploy_checklist.md](136_vercel_push_deploy_checklist.md)。
- Vercel Cron（繰り返しジョブ）は **本番環境** でのみ実行される。Preview デプロイでは Cron は動かない。

## 関連ドキュメント

- 命名規則: [00_naming_convention.md](00_naming_convention.md)
- ドキュメント逆引き: [142_docs_index.md](142_docs_index.md)
- 全体像: [CLAUDE.md](../CLAUDE.md)
