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

/** Advisor の 1 案（API の report.options の要素） */
type AdvisorOption = {
  label: string;
  description?: string;
  next_action: string;
  necessary_info: string;
  criteria_note: string;
  risks: string[];
  suggested_status?: string;
};

/** Advisor 成功時の report の形 */
type AdvisorReport = {
  target_node_id: string;
  target_title: string;
  current_status: string;
  options: AdvisorOption[];
  criteria?: { name: string; description: string }[];
  next_decision: string;
  summary: string;
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
  /** Advisor で「この案で進める」を押したときの選択中案（迷子防止のため下部に固定表示） */
  const [selectedAdvisorOption, setSelectedAdvisorOption] = useState<AdvisorOption | null>(null);

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
    setSelectedAdvisorOption(null);
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
            <AdvisorResultBlock
              result={advisorResult}
              warningsExpanded={warningsExpanded === "advisor"}
              onToggleWarnings={() =>
                setWarningsExpanded(warningsExpanded === "advisor" ? null : "advisor")
              }
              selectedOption={selectedAdvisorOption}
              onSelectOption={setSelectedAdvisorOption}
            />
          )}
          {/* 選択中の案（迷子防止・下部固定表示） */}
          {activeTab === "advisor" && selectedAdvisorOption && (
            <div
              style={{
                marginTop: 24,
                padding: 16,
                border: "2px solid #2e7d32",
                borderRadius: 10,
                background: "#e8f5e9",
                position: "sticky",
                bottom: 0,
              }}
            >
              <div style={{ fontWeight: 800, fontSize: 14, color: "#1b5e20", marginBottom: 10 }}>
                選択中の案
              </div>
              <div style={{ fontSize: 13 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{selectedAdvisorOption.label}</div>
                <div><b>次の一手:</b> {selectedAdvisorOption.next_action}</div>
                <div style={{ marginTop: 4 }}><b>必要情報:</b> {selectedAdvisorOption.necessary_info}</div>
                <div style={{ marginTop: 4 }}><b>判断基準:</b> {selectedAdvisorOption.criteria_note}</div>
                <div style={{ marginTop: 4 }}><b>リスク:</b> {selectedAdvisorOption.risks.join("; ")}</div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAdvisorOption(null)}
                style={{
                  marginTop: 12,
                  padding: "6px 12px",
                  fontSize: 12,
                  border: "1px solid #2e7d32",
                  borderRadius: 6,
                  background: "white",
                  cursor: "pointer",
                }}
              >
                選択を解除
              </button>
            </div>
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

/** Advisor 用: ok なら report.options をカード表示し、「この案で進める」で選択可能にする */
function AdvisorResultBlock({
  result,
  warningsExpanded,
  onToggleWarnings,
  selectedOption,
  onSelectOption,
}: {
  result: RunResult;
  warningsExpanded: boolean;
  onToggleWarnings: () => void;
  selectedOption: AdvisorOption | null;
  onSelectOption: (opt: AdvisorOption | null) => void;
}) {
  if (!result.ok) {
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

  const report = result.report as AdvisorReport | undefined;
  const options = report?.options && Array.isArray(report.options) ? report.options : [];

  return (
    <div style={{ marginTop: 12 }}>
      {report && (
        <>
          <div
            style={{
              padding: 10,
              background: "#f8f9fa",
              borderRadius: 8,
              marginBottom: 12,
              fontSize: 13,
            }}
          >
            <div>{report.summary}</div>
            <div style={{ marginTop: 6, fontWeight: 700 }}>まず決めること: {report.next_decision}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {options.map((opt, i) => (
              <div
                key={i}
                style={{
                  padding: 14,
                  border: "1px solid #ddd",
                  borderRadius: 10,
                  background: "white",
                }}
              >
                <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>{opt.label}</div>
                <div style={{ fontSize: 13, marginBottom: 4 }}>
                  <b>次の一手:</b> {opt.next_action}
                </div>
                <div style={{ fontSize: 13, marginBottom: 4 }}>
                  <b>必要情報:</b> {opt.necessary_info}
                </div>
                <div style={{ fontSize: 13, marginBottom: 4 }}>
                  <b>判断基準:</b> {opt.criteria_note}
                </div>
                <div style={{ fontSize: 13, marginBottom: 10 }}>
                  <b>リスク:</b> {opt.risks.join("; ")}
                </div>
                <button
                  type="button"
                  onClick={() => onSelectOption(opt)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    border: "1px solid #2e7d32",
                    background: "#2e7d32",
                    color: "white",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  この案で進める
                </button>
              </div>
            ))}
          </div>
        </>
      )}
      {!report && result.rendered != null && (
        <div
          style={{
            padding: 12,
            background: "#f8f9fa",
            borderRadius: 8,
            border: "1px solid #eee",
            whiteSpace: "pre-wrap",
            fontSize: 13,
          }}
        >
          {result.rendered}
        </div>
      )}
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
            <ul style={{ marginTop: 6, paddingLeft: 20, fontSize: 12, color: "#666" }}>
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
