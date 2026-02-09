# 30_Production_Operation_Test.md
## 本番運用テスト（GitHub Actions）— 合格条件つき

---

## ① 本番運用テスト（GitHub Actions）— 合格条件つき

### 前提（これが揃ってないと0点）

* **Vercel 本番**に環境変数がある
  * `NEXT_PUBLIC_SUPABASE_URL`
  * `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  * `SUPABASE_SERVICE_ROLE_KEY`
  * `OBSERVER_TOKEN`
* **GitHub リポジトリ Actions Secrets** にある
  * `NEXT_BASE_URL = https://context-os-five.vercel.app`
  * `OBSERVER_TOKEN = Vercel の OBSERVER_TOKEN と同じ値`
* **workflow**: `.github/workflows/observer_cron.yml` が main ブランチに存在
  * `python3 agent/observer/main.py --save --strict` になっていること

---

## 手順A：手動実行で “1回分” の合格を取る（最初の必須テスト）

1. GitHub → Actions → **Observer Cron** → **Run workflow**（手動実行）
2. **実行ログ**で以下を確認（合格条件）
   * `✓ Saved: report_id=...`
   * `✓ healthcheck passed: ...`
   * （もし追加していれば）`OP_TEST: saved=... latest=... warnings=0 ...`
3. Vercel の本番 API を確認（PowerShell でOK）
   * `curl.exe -s https://context-os-five.vercel.app/api/observer/reports/latest`
4. **返ってきた JSON** の合格条件
   * `"ok": true`
   * `report.report_id` が Actions の `report_id` と一致
   * `report.payload.warnings` が `[]`（0件）
   * `report.payload.node_count` が 0 以上の整数
   * `report.payload.suggested_next.debug.rule_version` が `"3-4.0"`（suggested_next が null の場合は対象外）

---

## 手順B：ダッシュボード表示の合格を取る（地味に重要）

1. `https://context-os-five.vercel.app/dashboard` を開く
2. **Observer の提案パネル**で合格条件
   * 「取得日時」「source」「node_count」「rule_version」が表示される
   * summary と node_count が矛盾していない（例：2件なら summary も「机の上に 2 件…」）
   * **warnings 0 件**なら ⚠ ブロックが表示されない
3. **warnings が 1 件以上**のときの表示確認（任意）
   * API に warnings 入りのレポートを保存するか、main.py で一時的にダミー warning を追加して保存する
   * ダッシュボードで **⚠ Observer が異常を検知しました（N件）** の注意ブロックが出ること
   * 各 warning の code / message と「詳細を見る」で details（JSON）が確認できること

---

## 手順C：warnings を意図的に出して “strict が落ちる” を確認（安全装置テスト）

（方法はどちらか1つでOK）

### C-1: 一時的に main.py で warnings を強制追加（docs/25 §12.5B と同様）

1. main.py の `observe()` の return 直前で、返す dict の `warnings` にダミーを 1 件追加（例: `[{"code": "TEST_WARNING", "message": "テスト用", "details": {}}]`）
2. `python3 main.py --save --strict` を実行
3. **合格条件**
   * exit(1) になる
   * stderr に warning 一覧（code / message / details）が出る
   * GitHub Actions でも同様に run が赤になる
4. 確認後、追加したダミー warnings を元に戻す

### C-2: API に warnings 入りレポートを POST してダッシュボードで確認

1. 認証付きで `POST /api/observer/reports` に `payload.warnings: [{ "code": "TEST", "message": "テスト", "details": {} }]` を含むレポートを送る
2. ダッシュボードを開き、**⚠ 注意ブロック**が表示されることを確認
3. （strict の検証は C-1 で行う）

---

## 失敗時の切り分け（ここが“初心者救済”）

| 現象 | 想定原因 | 確認・対処 |
|------|----------|------------|
| Actions が赤：`unauthorized` | GitHub Secrets の OBSERVER_TOKEN と Vercel の OBSERVER_TOKEN が不一致 | 両者を完全に同じ値にする。先頭・末尾の空白に注意。 |
| Actions が赤：`ConnectError` / 接続できません | NEXT_BASE_URL が間違っている（末尾スラッシュや https ミス含む） | NEXT_BASE_URL を `https://context-os-five.vercel.app` の形で再設定。 |
| ダッシュボードに Observer が出ない | latest API が 200 で返っていない、または取得・描画の不具合 | `/api/observer/reports/latest` を curl で確認。200 でも出ないなら dashboard の取得・描画ロジックを疑う。 |
| warnings が出た | 仕様のズレ or バグ（COUNT_MISMATCH / SUMMARY_MISMATCH 等） | docs/29 に従い code と details を見て原因を特定。strict 運用なので「出た時点で調査対象」。 |
| healthcheck failed: report_id mismatch | 保存直後に別のレポートが書き込まれた | 手動で再実行して再現するか確認。 |
| healthcheck failed: summary mismatch | 保存と latest の payload が一致していない | API や DB の不整合を疑う。 |

---

（以上、Phase 3-4.6 本番運用テスト — 合格条件つき）
