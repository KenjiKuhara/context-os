/**
 * Phase12-Dark: テーマ永続化キーと解決ロジック（A2/A3 で共有）
 * 契約: docs/118 A4。A2 の layout 先頭インライン script はこの resolveTheme() と同一分岐で複製している。
 * - localStorage には "light" | "dark" を保存
 * - html[data-theme] には常に "light" または "dark" のみ付与
 */

export const THEME_STORAGE_KEY = "kuharaos.theme";

export type ThemeStored = "light" | "dark";
export type ThemeResolved = "light" | "dark";

/** 保存値を data-theme に渡す値に解決する。明示的に "light" のときだけ light、それ以外は dark */
export function resolveTheme(stored: string | null): ThemeResolved {
  if (stored === "light") return "light";
  return "dark";
}

/** data-theme を適用する（document.documentElement に設定） */
export function applyResolvedTheme(resolved: ThemeResolved): void {
  try {
    document.documentElement.setAttribute("data-theme", resolved);
  } catch {
    // ignore
  }
}
