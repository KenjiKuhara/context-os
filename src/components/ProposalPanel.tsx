"use client";

/**
 * Phase 4: 提案パネル（Proposal Panel）
 * Organizer / Advisor の提案生成を UI から実行し、rendered または errors を表示する。
 * 41_phase4_quality_pipeline.md §7、POST /api/organizer/run, /api/advisor/run を使用。
 */

import { useCallback, useMemo, useState } from "react";

// GET /api/dashboard の trays と同じ形
type Trays = {
  in_progress: Array<{ id: string; title?: string | null; status?: string; [k: string]: unknown }>;
  needs_decision: Array<{ id: string; title?: string | null; status?: string; [k: string]: unknown }>;
  waiting_external: Array<{ id: string; title?: string | null; status?: string; [k: string]: unknown }>;
  cooling: Array<{ id: string; title?: string | null; status?: string; [k: string]: unknown }>;
  other_active: Array<{ id: string; title?: string | null; status?: string; [k: string]: unknown }>;
};

type RunResult = {
  ok: boolean;
  report: unknown;
  errors: string[];
  warnings: string[];
  rendered?: string;
};

type Tab = "organizer" | "advisor";

const TAB_LABEL: Record<Tab, string> = {
  organizer: "Organizer",
  advisor: "Advisor",
};

export interface ProposalPanelProps {
  /** GET /api/dashboard の trays。null のときはパネルは「データなし」表示 */
  trays: Trays | null;
}

function flattenTrays(trays: Trays): Array<{ id: string; title?: string | null; status?: string }> {
  return [
    ...trays.in_progress,
    ...trays.needs_decision,
    ...trays.waiting_external,
    ...trays.cooling,
    ...trays.other_active,
  ].filter((n) => n?.id);
}

export function ProposalPanel({ trays }: ProposalPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("organizer");
  const [organizerLoading, setOrganizerLoading] = useState(false);
  const [advisorLoading, setAdvisorLoading] = useState(false);
  const [organizerResult, setOrganizerResult] = useState<RunResult | null>(null);
  const [advisorResult, setAdvisorResult] = useState<RunResult | null>(null);
  const [userIntent, setUserIntent] = useState("");
  const [focusNodeId, setFocusNodeId] = useState<string>("");
  const [warningsExpanded, setWarningsExpanded] = useState<"organizer" | "advisor" | null>(null);

  const allNodes = useMemo(() => (trays ? flattenTrays(trays) : []), [trays]);
  const dashboardPayload = useMemo(
    () => (trays ? { trays } : null),
    [trays]
  );

  const runOrganizer = useCallback(async () => {
    if (!dashboardPayload || organizerLoading) return;
    setOrganizerLoading(true);
    setOrganizerResult(null);
    try {
      const res = await fetch("/api/organizer/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dashboard: dashboardPayload,
          userIntent: userIntent.trim() || undefined,
        }),
      });
      const data = (await res.json()) as RunResult;
      setOrganizerResult(data);
    } catch (e) {
      setOrganizerResult({
        ok: false,
        report: null,
        errors: [e instanceof Error ? e.message : "Request failed"],
        warnings: [],
      });
    } finally {
      setOrganizerLoading(false);
    }
  }, [dashboardPayload, organizerLoading, userIntent]);

  const runAdvisor = useCallback(async () => {
    if (!dashboardPayload || advisorLoading) return;
    setAdvisorLoading(true);
    setAdvisorResult(null);
    try {
      const res = await fetch("/api/advisor/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dashboard: dashboardPayload,
          focusNodeId: focusNodeId.trim() || undefined,
          userIntent: userIntent.trim() || undefined,
        }),
      });
      const data = (await res.json()) as RunResult;
      setAdvisorResult(data);
    } catch (e) {
      setAdvisorResult({
        ok: false,
        report: null,
        errors: [e instanceof Error ? e.message : "Request failed"],
        warnings: [],
      });
    } finally {
      setAdvisorLoading(false);
    }
  }, [dashboardPayload, advisorLoading, focusNodeId, userIntent]);

  if (!trays) {
    return (
      <div
        style={{
          marginTop: 24,
          border: "1px solid #ddd",
          borderRadius: 10,
          padding: 16,
          color: "#666",
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 16 }}>提案パネル（Phase 4）</div>
        <div style={{ marginTop: 8 }}>ダッシュボードを読み込んでから利用できます。</div>
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: 24,
        border: "1px solid #ddd",
        borderRadius: 10,
        padding: 16,
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>
        提案パネル（Phase 4）
      </div>

      {/* タブ */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["organizer", "advisor"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: activeTab === tab ? "2px solid #5567ff" : "1px solid #ddd",
              background: activeTab === tab ? "#f5f7ff" : "white",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {TAB_LABEL[tab]}
          </button>
        ))}
      </div>

      {/* 共通: userIntent（任意） */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 4 }}>
          ユーザー意図（任意）
        </label>
        <textarea
          value={userIntent}
          onChange={(e) => setUserIntent(e.target.value)}
          placeholder="例: 大きなタスクを分解して / この Node の選択肢が知りたい"
          rows={2}
          style={{
            width: "100%",
            maxWidth: 480,
            padding: 8,
            borderRadius: 6,
            border: "1px solid #ddd",
            fontSize: 13,
          }}
        />
      </div>

      {/* Organizer セクション */}
      {activeTab === "organizer" && (
        <div>
          <div style={{ marginBottom: 8 }}>
            <button
              type="button"
              onClick={runOrganizer}
              disabled={organizerLoading}
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                border: "1px solid #5567ff",
                background: organizerLoading ? "#ccc" : "#5567ff",
                color: "white",
                fontWeight: 700,
                cursor: organizerLoading ? "not-allowed" : "pointer",
              }}
            >
              {organizerLoading ? "生成中…" : "Organizer提案を生成"}
            </button>
            {organizerLoading && (
              <span style={{ marginLeft: 12, color: "#666", fontSize: 13 }}>
                実行中…
              </span>
            )}
          </div>
          {organizerResult && (
            <ResultBlock
              result={organizerResult}
              warningsExpanded={warningsExpanded === "organizer"}
              onToggleWarnings={() =>
                setWarningsExpanded(warningsExpanded === "organizer" ? null : "organizer")
              }
            />
          )}
        </div>
      )}

      {/* Advisor セクション */}
      {activeTab === "advisor" && (
        <div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 4 }}>
              対象 Node（未指定なら 1 件目）
            </label>
            <select
              value={focusNodeId}
              onChange={(e) => setFocusNodeId(e.target.value)}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid #ddd",
                marginBottom: 8,
                minWidth: 200,
              }}
            >
              <option value="">— 未指定 —</option>
              {allNodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.id.slice(0, 8)}… {String(n.title ?? "").slice(0, 20) || "(無題)"}
                </option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: 8 }}>
            <button
              type="button"
              onClick={runAdvisor}
              disabled={advisorLoading}
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                border: "1px solid #2e7d32",
                background: advisorLoading ? "#ccc" : "#2e7d32",
                color: "white",
                fontWeight: 700,
                cursor: advisorLoading ? "not-allowed" : "pointer",
              }}
            >
              {advisorLoading ? "生成中…" : "Advisor提案を生成"}
            </button>
            {advisorLoading && (
              <span style={{ marginLeft: 12, color: "#666", fontSize: 13 }}>
                実行中…
              </span>
            )}
          </div>
          {advisorResult && (
            <ResultBlock
              result={advisorResult}
              warningsExpanded={warningsExpanded === "advisor"}
              onToggleWarnings={() =>
                setWarningsExpanded(warningsExpanded === "advisor" ? null : "advisor")
              }
            />
          )}
        </div>
      )}
    </div>
  );
}

function ResultBlock({
  result,
  warningsExpanded,
  onToggleWarnings,
}: {
  result: RunResult;
  warningsExpanded: boolean;
  onToggleWarnings: () => void;
}) {
  if (result.ok) {
    return (
      <div style={{ marginTop: 12 }}>
        <div
          style={{
            padding: 12,
            background: "#f8f9fa",
            borderRadius: 8,
            border: "1px solid #eee",
            whiteSpace: "pre-wrap",
            fontSize: 13,
            fontFamily: "inherit",
          }}
        >
          {result.rendered ?? "（表示なし）"}
        </div>
        {result.warnings.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              onClick={onToggleWarnings}
              style={{
                fontSize: 12,
                padding: "4px 10px",
                border: "1px solid #b8860b",
                borderRadius: 6,
                background: "#fffde7",
                cursor: "pointer",
              }}
            >
              ⚠ 警告 {result.warnings.length} 件 {warningsExpanded ? "（閉じる）" : "（開く）"}
            </button>
            {warningsExpanded && (
              <ul
                style={{
                  marginTop: 6,
                  paddingLeft: 20,
                  fontSize: 12,
                  color: "#666",
                }}
              >
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div
        style={{
          padding: 12,
          border: "1px solid #e57373",
          borderRadius: 8,
          background: "#ffebee",
          fontSize: 13,
        }}
      >
        <div style={{ fontWeight: 700, color: "#c62828", marginBottom: 8 }}>
          検証エラー（不足している項目）
        </div>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {result.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
