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
  /** 遷移可能な状態のみ押せる。未指定の場合は全ボタン押下可（API で 422 になる可能性あり） */
  validTransitions?: readonly string[];
  /** true のときは全ボタンを非活性（更新中など）。Phase12-A: 更新中はエラー表示せずボタンのみ非活性。 */
  buttonsDisabled?: boolean;
  onStatusClick: (status: string) => void;
};

export function StatusQuickSwitch({ currentStatus, validTransitions, buttonsDisabled, onStatusClick }: StatusQuickSwitchProps) {
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
        const canTransition = validTransitions == null || validTransitions.includes(status);
        const disabled = buttonsDisabled || isCurrent || !canTransition;
        const style = getButtonStyle(status);
        return (
          <button
            key={status}
            type="button"
            disabled={disabled}
            onClick={() => onStatusClick(status)}
            aria-pressed={isCurrent}
            aria-label={
              isCurrent
                ? `現在：${STATUS_LABELS[status as Status] ?? status}`
                : !canTransition
                  ? `この状態へは遷移できません（${STATUS_LABELS[status as Status] ?? status}）`
                  : `${STATUS_LABELS[status as Status] ?? status}に切り替え`
            }
            title={!canTransition ? "この状態へは遷移ルール上切り替えできません" : undefined}
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              border: isCurrent ? "2px solid var(--border-focus)" : "1px solid var(--border-default)",
              background: isCurrent ? style.background : "var(--bg-card)",
              color: isCurrent ? style.color : disabled ? "var(--text-muted)" : "var(--text-secondary)",
              fontSize: 12,
              fontWeight: isCurrent ? 700 : 500,
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled && !isCurrent ? 0.6 : 1,
            }}
          >
            {STATUS_LABELS[status as Status] ?? status}
          </button>
        );
      })}
    </div>
  );
}
