# 144 — 技術スタック（Steering）

context-os の主要技術選定と役割。詳細は CLAUDE.md や各機能ドキュメントを参照。

---

## スタック概要

| 領域 | 技術 | 役割 |
|------|------|------|
| フロント・API | Next.js (App Router) | 画面・API ルート。ビジネスルールの唯一の実行場所。 |
| DB・認証 | Supabase (PostgreSQL + Auth) | 永続化・RLS・セッション（Cookie）。 |
| ホスティング・Cron | Vercel | 本番デプロイ・繰り返しジョブ（1 日 1 回）。 |
| AI | OpenAI API | Organizer / Advisor / Observer / proposal-quality。 |

## 重要な設計判断

- **状態の確定**: ステータス・温度の最終決定は App（stateMachine 等）。LLM は提案のみ。**ステータスや遷移を触る場合は [05_State_Machine.md](05_State_Machine.md) と `src/lib/stateMachine.ts` の両方を参照し、一致させる。**
- **RLS**: 全テーブルで Row Level Security を有効にし、user_id または nodes 経由で所有者を限定。
- **時刻**: 繰り返しは JST。Cron は UTC で設定（vercel.json）。詳細は 135・137・138。

## 関連ドキュメント

- コマンド・レイヤー・テーブル: リポジトリ直下 [CLAUDE.md](../CLAUDE.md)
- ローカル環境: [140_local_dev_setup.md](140_local_dev_setup.md)
- API 一覧: [139_api_routes_index.md](139_api_routes_index.md)
