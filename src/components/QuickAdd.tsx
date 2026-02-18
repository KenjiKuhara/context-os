"use client";

/**
 * Phase14-QuickAdd: 1行input + 右側小さな送信ボタン。
 * Enterで送信・ボタンでも送信。inputは無効化しない。ボタンのみ送信中は非活性。
 * 自動フォーカスはしない。Escで即クリア。追加後フォーカス維持。
 */

import { useRef, type RefObject } from "react";

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (value.trim()) onSubmit();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onClear();
      return;
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, maxWidth: 520 }}>
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="タスクを追加…"
        aria-label="タスクを追加（Enterで確定、Escでクリア）"
        style={{
          flex: 1,
          minWidth: 0,
          padding: "10px 12px",
          borderRadius: 8,
          border: "1px solid var(--border-default)",
          background: "var(--bg-card)",
          color: "var(--text-primary)",
          fontSize: 14,
          outline: "none",
        }}
      />
      <button
        type="button"
        onClick={onSubmit}
        disabled={buttonDisabled || !value.trim()}
        aria-label="追加"
        style={{
          padding: "8px 14px",
          borderRadius: 8,
          border: "1px solid var(--border-default)",
          background: "var(--bg-card)",
          color: "var(--text-primary)",
          fontSize: 13,
          fontWeight: 600,
          cursor: buttonDisabled || !value.trim() ? "not-allowed" : "pointer",
          opacity: buttonDisabled ? 0.7 : 1,
        }}
      >
        追加
      </button>
    </div>
  );
}
