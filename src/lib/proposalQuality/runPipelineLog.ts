/**
 * Phase 4: パイプライン実行時のサーバーログ（どの errors で落ちたか、再生成回数、最終 ok）。
 */

export interface LogContext {
  logAttempt(
    type: "organizer" | "advisor",
    attempt: number,
    errors: string[],
    warnings: string[],
    ok: boolean
  ): void;
  logFinal(type: "organizer" | "advisor", retryCount: number, ok: boolean): void;
}

export function createServerLogContext(): LogContext {
  return {
    logAttempt(type, attempt, errors, warnings, ok) {
      const prefix = `[${type}] attempt=${attempt}`;
      if (errors.length > 0) {
        console.warn(`${prefix} errors=${errors.length} ok=${ok}`, errors);
      }
      if (warnings.length > 0) {
        console.info(`${prefix} warnings=${warnings.length}`, warnings);
      }
      if (ok && errors.length === 0) {
        console.info(`${prefix} ok=true`);
      }
    },
    logFinal(type, retryCount, ok) {
      console.info(`[${type}] final retryCount=${retryCount} ok=${ok}`);
    },
  };
}
