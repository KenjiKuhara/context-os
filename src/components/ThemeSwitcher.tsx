"use client";

/**
 * Phase12-Dark A3: ライト / ダーク / システムに合わせる の 3 択 UI。
 * /dashboard 上部に配置。色はトークンのみ使用（Block B 前でもテーマに追従するため）。
 */

import { useEffect, useState } from "react";
import {
  THEME_STORAGE_KEY,
  resolveTheme,
  applyResolvedTheme,
  type ThemeStored,
} from "@/lib/theme";

const OPTIONS: { value: ThemeStored; label: string }[] = [
  { value: "light", label: "ライト" },
  { value: "dark", label: "ダーク" },
  { value: "system", label: "システムに合わせる" },
];

function getStoredTheme(): ThemeStored {
  if (typeof window === "undefined") return "system";
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    // ignore
  }
  return "system";
}

export function ThemeSwitcher() {
  const [selected, setSelected] = useState<ThemeStored>("system");

  // マウント時に localStorage から読み、選択状態を初期化
  useEffect(() => {
    setSelected(getStoredTheme());
  }, []);

  // "system" 選択時のみ OS テーマ変更に追従
  useEffect(() => {
    if (selected !== "system") return;
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return;
    const apply = () => {
      applyResolvedTheme(resolveTheme("system"));
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [selected]);

  const handleSelect = (value: ThemeStored) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, value);
    } catch {
      // ignore
    }
    applyResolvedTheme(resolveTheme(value));
    setSelected(value);
  };

  return (
    <div
      role="group"
      aria-label="テーマ"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0,
        padding: "4px 0",
        borderRadius: 8,
        border: "1px solid var(--border-default)",
        background: "var(--bg-card)",
      }}
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => handleSelect(opt.value)}
          aria-pressed={selected === opt.value}
          style={{
            padding: "6px 12px",
            fontSize: 12,
            border: "none",
            background: selected === opt.value ? "var(--color-info-bg)" : "transparent",
            color: selected === opt.value ? "var(--color-info)" : "var(--text-secondary)",
            fontWeight: selected === opt.value ? 700 : 400,
            cursor: "pointer",
            borderRadius: 6,
            margin: selected === opt.value ? 2 : 0,
            marginRight: opt.value !== OPTIONS[OPTIONS.length - 1].value ? 0 : undefined,
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
