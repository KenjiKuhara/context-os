"use client";

/**
 * Phase15-StatusQuickSwitch: 詳細画面で全状態を常時表示し、クリックで即切替。
 * 現在状態 = active + disabled。他 = inactive。トークンのみ使用。
 */

import { ALL_STATUSES, STATUS_LABELS, type Status } from "@/lib/stateMachine";

function getButtonStyle(status: string): { background: string; color: string } {
  if (status === "DONE") return { background: "var(--bg-success)", color: "var(--text-success)" };
  if (status === "CANCELLED") return { background: "var(--bg-danger)", color: "var(--text-danger)" };
  if (["BLOCKED", "NEEDS_DECISION", "NEEDS_REVIEW"].includes(status))
    return { background: "var(--bg-warning)", color: "var(--text-warning)" };
  return { background: "var(--bg-badge)", color: "var(--text-primary)" };
}

type StatusQuickSwitchProps = {
  currentStatus: string;
  onStatusClick: (status: string) => void;
};

export function StatusQuickSwitch({ currentStatus, onStatusClick }: StatusQuickSwitchProps) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        marginTop: 6,
      }}
      role="group"
      aria-label="状態を切り替え"
    >
      {(ALL_STATUSES as readonly string[]).map((status) => {
        const isCurrent = status === currentStatus;
        const style = getButtonStyle(status);
        return (
          <button
            key={status}
            type="button"
            disabled={isCurrent}
            onClick={() => onStatusClick(status)}
            aria-pressed={isCurrent}
            aria-label={`${STATUS_LABELS[status as Status] ?? status}に切り替え`}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              border: isCurrent ? "2px solid var(--border-focus)" : "1px solid var(--border-default)",
              background: isCurrent ? style.background : "var(--bg-card)",
              color: isCurrent ? style.color : "var(--text-secondary)",
              fontSize: 12,
              fontWeight: isCurrent ? 700 : 500,
              cursor: isCurrent ? "default" : "pointer",
              opacity: isCurrent ? 1 : 1,
            }}
          >
            {STATUS_LABELS[status as Status] ?? status}
          </button>
        );
      })}
    </div>
  );
}
