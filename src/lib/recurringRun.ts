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
