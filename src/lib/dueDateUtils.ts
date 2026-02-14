/**
 * 期日（due_date）の判定ユーティリティ。
 * 133: フラット表示の期日ソート・視覚強調用。Asia/Tokyo 基準の日付比較。
 */

const TIMEZONE = "Asia/Tokyo";

/**
 * 基準日（今日）を Asia/Tokyo で YYYY-MM-DD にする。
 */
function getTodayInTokyo(now: Date): string {
  return now.toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}

/**
 * 指定日（YYYY-MM-DD）の N 日後を Asia/Tokyo で YYYY-MM-DD にする。
 */
function addDaysInTokyo(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00+09:00");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toLocaleDateString("en-CA", { timeZone: TIMEZONE });
}

/**
 * 期日の状態を返す純粋関数。
 * @param dueDate - YYYY-MM-DD または null/undefined
 * @param now - 基準とする現在日時（通常は new Date()）
 * @returns "overdue" | "soon" | "none"
 */
export function getDueStatus(
  dueDate: string | null | undefined,
  now: Date
): "overdue" | "soon" | "none" {
  const s = dueDate == null ? "" : String(dueDate).trim();
  if (!s) return "none";

  const today = getTodayInTokyo(now);
  const todayPlus3 = addDaysInTokyo(today, 3);

  if (s <= today) return "overdue";
  if (s <= todayPlus3) return "soon";
  return "none";
}
