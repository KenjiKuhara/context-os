"use client";

/**
 * Phase14-QuickAdd: 1行input + 右側小さな送信ボタン。
 * Enterで送信・ボタンでも送信。inputは無効化しない。ボタンのみ送信中は非活性。
 * 自動フォーカスはしない。Escで即クリア。追加後フォーカス維持。
 */

import { useRef, useState, type RefObject } from "react";

type QuickAddProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onClear: () => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  /** 送信中はボタンのみ非活性。inputは止めない。 */
  buttonDisabled?: boolean;
};

export function QuickAdd({
  value,
  onChange,
  onSubmit,
  onClear,
  inputRef: externalRef,
  buttonDisabled = false,
}: QuickAddProps) {
  const internalRef = useRef<HTMLInputElement>(null);
  const ref = externalRef ?? internalRef;
  const [focused, setFocused] = useState(false);
  const hasValue = value.trim().length > 0;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (hasValue) onSubmit();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onClear();
      return;
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 0,
        maxWidth: 520,
        borderRadius: 10,
        border: focused
          ? "1px solid var(--border-focus)"
          : "1px solid var(--border-default)",
        boxShadow: focused
          ? "0 0 0 3px var(--focus-ring)"
          : "var(--shadow-card)",
        background: "var(--bg-card)",
        transition: "border-color 150ms ease, box-shadow 150ms ease",
        overflow: "hidden",
      }}
    >
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="タスクを追加… (Enter で確定)"
        aria-label="タスクを追加（Enterで確定、Escでクリア）"
        style={{
          flex: 1,
          minWidth: 0,
          padding: "10px 14px",
          border: "none",
          background: "transparent",
          color: "var(--text-primary)",
          fontSize: 14,
          outline: "none",
        }}
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={buttonDisabled || !hasValue}
        aria-label="追加"
        style={{
          padding: "10px 16px",
          border: "none",
          borderLeft: "1px solid var(--border-subtle)",
          background: hasValue && !buttonDisabled ? "var(--color-info)" : "transparent",
          color: hasValue && !buttonDisabled ? "#fff" : "var(--text-muted)",
          fontSize: 13,
          fontWeight: 600,
          cursor: buttonDisabled || !hasValue ? "not-allowed" : "pointer",
          transition: "background 150ms ease, color 150ms ease",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {buttonDisabled ? "追加中…" : "追加"}
      </button>
    </div>
  );
}
