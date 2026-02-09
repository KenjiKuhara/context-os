/**
 * POST /api/observer/run
 *
 * Observer 実行の「トリガー入口」（将来用）。
 *
 * 現時点では Observer は外部（Python CLI / cron）で動作し、
 * 結果を POST /api/observer/reports に送信する。
 * この /run エンドポイントは将来の実行トリガー用に予約する。
 *
 * 想定される将来の利用:
 *   - Vercel Cron Job からの呼び出し
 *   - ダッシュボードの「今すぐ観測」ボタン
 *   - MCP ツールからの呼び出し
 *
 * 現在の運用フロー:
 *   1. 外部で python agent/observer/main.py を実行
 *   2. 出力された ObserverReport を POST /api/observer/reports に送信
 *   3. ダッシュボードが GET /api/observer/reports/latest で取得・表示
 */

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    ok: false,
    error: "Not implemented. Observer runs externally and POSTs results to /api/observer/reports. See docs/26_Agent_Observer_MVP.md §3.",
    hint: "Run: python agent/observer/main.py | curl -X POST /api/observer/reports -d @-",
  }, { status: 501 });
}
