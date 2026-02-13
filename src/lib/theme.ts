/**
 * Phase12-Dark: テーマ永続化キーと解決ロジック（A2/A3 で共有）
 * 契約: docs/118 A4。A2 の layout 先頭インライン script はこの resolveTheme() と同一分岐で複製している。
 * - localStorage には "light" | "dark" | "system" を保存
 * - html[data-theme] には常に "light" または "dark" のみ付与
 */

export const THEME_STORAGE_KEY = "kuharaos.theme";

export type ThemeStored = "light" | "dark" | "system";
export type ThemeResolved = "light" | "dark";

/** 保存値を data-theme に渡す値に解決する（system のときは matchMedia で判定） */
export function resolveTheme(stored: string | null): ThemeResolved {
  if (stored === "light" || stored === "dark") return stored;
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

/** data-theme を適用する（document.documentElement に設定） */
export function applyResolvedTheme(resolved: ThemeResolved): void {
  try {
    document.documentElement.setAttribute("data-theme", resolved);
  } catch {
    // ignore
  }
}
