# 32 — Observer 本番運用の到達点（Phase 3-5）

## 目的

Observer を **「本番で静かに・安全に・止められる」** 運用として言語化し、到達点とやっていないこと・将来の拡張を固定する。既存コードの挙動は変えず、運用の明文化のみを行う。

---

## 1. 現在の到達点まとめ

| 項目 | 内容 |
|------|------|
| **実行** | GitHub Actions（cron 1 時間ごと or 手動）。`python3 agent/observer/main.py --save --strict`。 |
| **保存** | ObserverReport を POST /api/observer/reports に送り、Vercel 上の DB に保存。payload はそのまま（meta 含む）。 |
| **表示** | ダッシュボードの「Observer の提案」で suggested_next・status_proposals・warnings・鮮度（最終観測）を表示。 |
| **検知** | --strict で payload.warnings が 1 件以上なら run を失敗（exit 1）にし、仕様ズレ・バグを埋もれさせない。 |
| **通知** | run 失敗時に Slack / ChatWork へ webhook 通知（任意設定）。 |
| **鮮度** | payload.meta.observed_at を保存・表示。60 分以上で「少し古い提案です」を表示（warnings とは別）。 |

Observer は **観測し、提案する。決して Apply しない。** 人間がダッシュボードで提案を見て、必要なら人間 UI から Apply する。

---

## 2. やっていないこと（意図的にスコープ外）

以下は **現時点の Observer の責務外** であり、設計として行わない。

| やっていないこと | 説明 |
|------------------|------|
| **Apply** | Observer は estimate-status の Apply（confirm_status 送信）を **一切呼ばない**。18_Skill_Governance §2.2 に従う。 |
| **自動判断** | 「どの Node を次にやるか」の **決定** は人間が行う。Observer は suggested_next を **提案** するだけ。 |
| **状態の書き換え** | Node の status や DB の書き換えは、人間 UI または（将来の）Executor 経由のみ。Observer は読み取りと Preview のみ。 |
| **warnings の無視** | --strict により、warnings が 1 件でもあれば run は失敗する。「とりあえず保存し続ける」は許容しない。 |
| **鮮度による自動ブロック** | 鮮度は表示専用。古い提案を「使わない」と自動判定したり、run を失敗させたりしない。 |

これらを守ることで、「静かに・安全に・止められる」運用が成り立つ。

---

## 3. 連続失敗時の対応方針

- **通知**: WEBHOOK_URL または CHATWORK_* を設定していれば、**失敗のたびに** Slack/ChatWork に通知が飛ぶ。連続失敗は「通知が連続して届く」状態になる。
- **手動確認**: 1 回の失敗で原因が分かれば、Secrets 修正・コード修正・再実行で解消する。**同じ原因で連続して失敗**する場合は、docs/27 §9（失敗と「止まる」の設計思想）および §9.2（warnings の判断フロー）に沿って原因を切り分け、必要なら **cron を一時停止**（schedule のコメントアウト等）して修正を優先する。
- **「止める」は運用として許容**: 問題が解明するまで workflow の schedule を止め、手動実行だけで様子を見る選択も可能。Observer は「止まっても」既存のダッシュボードや人間 UI の利用には影響しない（最新レポートが更新されないだけ）。

---

## 4. 将来拡張ポイント

Observer は Level 0 として完成させ、**上流の Organizer / Advisor や、下流の Executor との接続** は将来の拡張とする。

| 拡張 | 説明 | 参照 |
|------|------|------|
| **Advisor（Level 2）への接続** | ObserverReport を Advisor の入力として渡し、選択肢・文案を生成する。Advisor は Apply を呼ばず、人間が選んでから Executor に渡す。 | 22_SubAgent_Advisor.md, 25_Boundary_NextJS_PythonAgent.md |
| **Executor（Level 3）への接続** | 人間が承認した内容を、Executor が Confirmation 付きで Apply する。Observer は「提案」まで。実行は Executor または人間 UI。 | 24_SubAgent_Executor.md, 23_Human_Confirmation_Model.md |
| **Organizer（Level 1）** | Node 群の構造整理。Observer の出力を整理の入力にすることは可能だが、現時点では未実装。 | 21_SubAgent_Organizer.md |

現状の Observer は **単体で本番運用可能** であり、上記拡張は「つなぐときの接続点」としてドキュメント上で明示している。

---

## 5. 参照

- **19_SubAgent_Observer.md** — Observer の設計 SSOT
- **26_Agent_Observer_MVP.md** — 起動・実行ガイド
- **27_Observer_Operations.md** — 定期実行・失敗時の判断・鮮度の見方
- **29_Observer_Warnings.md** — warnings の定義
- **31_Observer_Freshness.md** — 鮮度の定義と表示
- **20_SubAgent_Catalog.md** — Level 0〜3 の整理
