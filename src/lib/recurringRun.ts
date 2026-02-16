/**
 * 繰り返しタスク生成の共通ロジック（run / run-now で使用）
 */

const TIME_OF_DAY_RE = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

export function parseTimeOfDay(s: string): { hours: number; minutes: number } | null {
  if (!TIME_OF_DAY_RE.test(s)) return null;
  const [h, m] = s.split(":").map(Number);
  return { hours: h, minutes: m };
}

/** next_run_at を schedule_type に従って次回に進める（UTC） */
export function computeNextRunAt(
  current: string,
  scheduleType: string,
  timeOfDay: string
): string {
  const parsed = parseTimeOfDay(timeOfDay);
  const [hours, minutes] = parsed ? [parsed.hours, parsed.minutes] : [0, 0];
  const d = new Date(current);
  if (scheduleType === "daily") {
    d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(hours, minutes, 0, 0);
    return d.toISOString();
  }
  if (scheduleType === "weekly") {
    d.setUTCDate(d.getUTCDate() + 7);
    d.setUTCHours(hours, minutes, 0, 0);
    return d.toISOString();
  }
  if (scheduleType === "monthly") {
    d.setUTCMonth(d.getUTCMonth() + 1);
    d.setUTCHours(hours, minutes, 0, 0);
    const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    const day = Math.min(d.getUTCDate(), lastDay);
    d.setUTCDate(day);
    return d.toISOString();
  }
  d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(hours, minutes, 0, 0);
  return d.toISOString();
}

/** YYYY-MM-DD */
export function toDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 現在時刻の「今日」の日付を JST で YYYY-MM-DD で返す。例: 15:00 UTC = JST 0:00 のときは JST のその日。 */
export function getTodayJST(): string {
  return new Date(Date.now() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/** ISO 文字列（UTC）の「JST での日付」を YYYY-MM-DD で返す。 */
export function toJSTDate(iso: string): string {
  return new Date(new Date(iso).getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
}

/** JST の「今日」の終わり 23:59:59 を UTC にした ISO 文字列。next_run_at <= この値で「今日 JST まで」を取得する。 */
export function getEndOfTodayJSTUTC(): string {
  const todayJST = getTodayJST();
  return `${todayJST}T14:59:59.999Z`;
}
