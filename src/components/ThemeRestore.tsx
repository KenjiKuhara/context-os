"use client";

/**
 * Phase12-Dark: ハイドレーション後に data-theme を再適用する。
 * A2 のインライン script で付与した data-theme が React のハイドレーションで
 * 消える場合があるため、クライアントでマウント直後に保存値から再適用する。
 */

import { useLayoutEffect } from "react";
import { THEME_STORAGE_KEY, resolveTheme, applyResolvedTheme } from "@/lib/theme";

function getStored(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function ThemeRestore() {
  useLayoutEffect(() => {
    const stored = getStored();
    applyResolvedTheme(resolveTheme(stored));
  }, []);
  return null;
}
