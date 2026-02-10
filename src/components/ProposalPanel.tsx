"use client";

/**
 * Phase 4: 提案パネル（Proposal Panel）
 * Organizer / Advisor の提案生成を UI から実行し、rendered または errors を表示する。
 * 41_phase4_quality_pipeline.md §7、POST /api/organizer/run, /api/advisor/run を使用。
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { STATUS_LABELS, getValidTransitions, isValidStatus, type Status } from "@/lib/status";

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

/** Advisor 成功時の report の形（Apply 向け targetNodeId をサーバが必ず設定） */
type AdvisorReport = {
  targetNodeId: string;
  target_node_id: string;
  target_title: string;
  current_status: string;
  options: AdvisorOption[];
  criteria?: { name: string; description: string }[];
  next_decision: string;
  summary: string;
};

type Tab = "organizer" | "advisor";

/** Apply エラーを段階別に保持（ユーザー向け短メッセージ + 開発者向け詳細） */
export type ApplyErrorInfo = {
  stage: "confirmations" | "estimate" | "network";
  message: string;
  status?: number;
  endpoint?: string;
  body?: string;
  rawError?: { name?: string; message?: string; stack?: string };
};

/** Apply 成功時の監査用詳細（折りたたみ表示） */
type ApplySuccessDetail = { confirmation_id: string };

function formatResponseBody(data: unknown): string {
  if (data === null || data === undefined) return "";
  if (typeof data === "string") return data;
  if (typeof data === "object") {
    const o = data as Record<string, unknown>;
    const parts: string[] = [];
    if (o.message != null) parts.push(`message: ${String(o.message)}`);
    if (Array.isArray(o.errors)) parts.push(`errors: ${JSON.stringify(o.errors)}`);
    if (parts.length > 0) return parts.join("\n");
    return JSON.stringify(data, null, 2);
  }
  return String(data);
}

const TAB_LABEL: Record<Tab, string> = {
  organizer: "Organizer",
  advisor: "Advisor",
};

export interface ProposalPanelProps {
  /** GET /api/dashboard の trays。null のときはパネルは「データなし」表示 */
  trays: Trays | null;
  /** Apply 成功時にダッシュボードを再取得するコールバック */
  onRefreshDashboard?: () => Promise<unknown>;
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

export function ProposalPanel({ trays, onRefreshDashboard }: ProposalPanelProps) {
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
  /** Apply（ステータス変更）用 */
  const applyInFlightRef = useRef(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyError, setApplyError] = useState<ApplyErrorInfo | null>(null);
  const [applyErrorExpanded, setApplyErrorExpanded] = useState(false);
  const [applySuccessMessage, setApplySuccessMessage] = useState<string | null>(null);
  const [applySuccessDetail, setApplySuccessDetail] = useState<ApplySuccessDetail | null>(null);
  const [applySuccessDetailExpanded, setApplySuccessDetailExpanded] = useState(false);
  const [applyToStatus, setApplyToStatus] = useState<string>("");

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

  const advisorReport = advisorResult?.ok && advisorResult.report
    ? (advisorResult.report as AdvisorReport)
    : null;
  const applyTargetNode = useMemo(() => {
    if (!trays || !advisorReport?.targetNodeId) return null;
    return allNodes.find((n) => n.id === advisorReport.targetNodeId) ?? null;
  }, [trays, advisorReport?.targetNodeId, allNodes]);

  const applyStatus = useCallback(async () => {
    if (applyInFlightRef.current) return;
    if (!applyTargetNode || !advisorReport) return;
    const from = applyTargetNode.status ?? "";
    const validNext = isValidStatus(from) ? getValidTransitions(from) : [];
    const to = applyToStatus.trim() || validNext[0];
    if (!to) return;
    applyInFlightRef.current = true;
    const targetNodeId = advisorReport.targetNodeId;
    const ok = window.confirm(
      `Node ${targetNodeId} のステータスを ${from} → ${to} に変更します。よろしいですか？`
    );
    if (!ok) {
      applyInFlightRef.current = false;
      return;
    }
    setApplyLoading(true);
    setApplyError(null);
    setApplySuccessMessage(null);
    setApplySuccessDetail(null);
    const confEndpoint = "/api/confirmations";
    const estEndpoint = `/api/nodes/${targetNodeId}/estimate-status`;
    try {
      let confRes: Response;
      try {
        confRes = await fetch(confEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            node_id: targetNodeId,
            ui_action: "advisor_apply",
            proposed_change: { type: "status_change", from, to },
          }),
        });
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setApplyError({
          stage: "network",
          message: "通信に失敗しました。ネットワークを確認して再実行してください",
          rawError: {
            name: err.name,
            message: err.message,
            stack: err.stack,
          },
        });
        return;
      }
      const confJson = await confRes.json().catch(() => ({}));
      if (!confRes.ok || !confJson.ok || !confJson.confirmation?.confirmation_id) {
        setApplyError({
          stage: "confirmations",
          message: "確認IDの発行に失敗しました",
          status: confRes.status,
          endpoint: confEndpoint,
          body: formatResponseBody(confJson),
        });
        return;
      }
      const confirmationId = confJson.confirmation.confirmation_id as string;

      let res: Response;
      try {
        res = await fetch(estEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirm_status: to,
            source: "human_ui",
            confirmation_id: confirmationId,
          }),
        });
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setApplyError({
          stage: "network",
          message: "通信に失敗しました。ネットワークを確認して再実行してください",
          rawError: {
            name: err.name,
            message: err.message,
            stack: err.stack,
          },
        });
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setApplyError({
          stage: "estimate",
          message: "ステータス変更に失敗しました",
          status: res.status,
          endpoint: estEndpoint,
          body: formatResponseBody(json),
        });
        return;
      }

      setApplySuccessDetail({ confirmation_id: confirmationId });
      const fromLabel = (STATUS_LABELS as Record<string, string>)[from] ?? from;
      const toLabel = (STATUS_LABELS as Record<string, string>)[json.to_status ?? to] ?? to;
      try {
        const newTrays = onRefreshDashboard ? await onRefreshDashboard() : null;
        if (newTrays && typeof newTrays === "object" && "in_progress" in newTrays) {
          const flat = flattenTrays(newTrays as Trays);
          const updatedNode = flat.find((n) => n.id === targetNodeId);
          const latestStatus = updatedNode?.status ?? to;
          const latestLabel = (STATUS_LABELS as Record<string, string>)[latestStatus] ?? latestStatus;
          setApplySuccessMessage(
            `適用しました（${fromLabel}→${toLabel}）。現在: ${latestStatus}（${latestLabel}）`
          );
        } else {
          setApplySuccessMessage(`適用しました（${fromLabel}→${toLabel}）`);
        }
      } catch (_) {
        setApplySuccessMessage(
          "適用は成功しましたが、画面更新に失敗しました。再読み込みしてください"
        );
      }
    } finally {
      setApplyLoading(false);
      applyInFlightRef.current = false;
    }
  }, [advisorReport, applyTargetNode, applyToStatus, onRefreshDashboard]);

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
          {/* 選択中の案（迷子防止・下部固定表示）＋ Apply UI */}
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
              {advisorReport && (
                <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #a5d6a7" }}>
                  <div style={{ fontSize: 12, color: "#1b5e20", marginBottom: 8 }}>Apply（ステータス変更）</div>
                  {!applyTargetNode ? (
                    <div style={{ fontSize: 13, color: "#c62828" }}>対象Nodeが見つかりません</div>
                  ) : (
                    <>
                      <div style={{ fontSize: 13, marginBottom: 6 }}>
                        現在のステータス: <b>{applyTargetNode.status ?? "—"}</b>
                        {(STATUS_LABELS as Record<string, string>)[applyTargetNode.status ?? ""] && (
                          <span style={{ color: "#666", marginLeft: 4 }}>
                            （{(STATUS_LABELS as Record<string, string>)[applyTargetNode.status ?? ""]}）
                          </span>
                        )}
                      </div>
                      {isValidStatus(applyTargetNode.status) ? (
                        <>
                          <label style={{ display: "block", fontSize: 12, marginBottom: 4 }}>変更先</label>
                          <select
                            value={applyToStatus || (getValidTransitions(applyTargetNode.status as Status)[0] ?? "")}
                            onChange={(e) => setApplyToStatus(e.target.value)}
                            disabled={applyLoading}
                            style={{
                              padding: "6px 10px",
                              borderRadius: 6,
                              border: "1px solid #2e7d32",
                              marginBottom: 8,
                              minWidth: 200,
                              fontSize: 13,
                              opacity: applyLoading ? 0.7 : 1,
                              cursor: applyLoading ? "not-allowed" : "pointer",
                            }}
                          >
                            {getValidTransitions(applyTargetNode.status as Status).map((s) => (
                              <option key={s} value={s}>
                                {s}（{(STATUS_LABELS as Record<string, string>)[s] ?? s}）
                              </option>
                            ))}
                          </select>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <button
                              type="button"
                              onClick={applyStatus}
                              disabled={applyLoading || !(applyToStatus || getValidTransitions(applyTargetNode.status as Status)[0])}
                              style={{
                                padding: "8px 16px",
                                borderRadius: 8,
                                border: "1px solid #1b5e20",
                                background: applyLoading ? "#ccc" : "#2e7d32",
                                color: "white",
                                fontWeight: 700,
                                fontSize: 13,
                                cursor: applyLoading ? "not-allowed" : "pointer",
                              }}
                            >
                              {applyLoading ? "適用中…" : "Apply"}
                            </button>
                            {applySuccessMessage && (
                              <span style={{ fontSize: 13, color: "#1b5e20" }}>{applySuccessMessage}</span>
                            )}
                          </div>
                          {applySuccessMessage && applySuccessDetail && (
                            <div style={{ marginTop: 8 }}>
                              <button
                                type="button"
                                onClick={() => setApplySuccessDetailExpanded(!applySuccessDetailExpanded)}
                                style={{
                                  fontSize: 12,
                                  padding: "4px 8px",
                                  border: "1px solid #2e7d32",
                                  borderRadius: 6,
                                  background: "#e8f5e9",
                                  color: "#1b5e20",
                                  cursor: "pointer",
                                }}
                              >
                                {applySuccessDetailExpanded ? "閉じる" : "監査用詳細"}
                              </button>
                              {applySuccessDetailExpanded && (
                                <pre
                                  style={{
                                    marginTop: 6,
                                    padding: 8,
                                    background: "#fff",
                                    border: "1px solid #a5d6a7",
                                    borderRadius: 6,
                                    fontSize: 12,
                                    overflow: "auto",
                                    whiteSpace: "pre-wrap",
                                  }}
                                >
                                  {`confirmation_id: ${applySuccessDetail.confirmation_id}`}
                                </pre>
                              )}
                            </div>
                          )}
                          {applyError && (
                            <div style={{ marginTop: 8 }}>
                              <div style={{ fontSize: 13, color: "#c62828", marginBottom: 4 }}>
                                {applyError.message}
                              </div>
                              <button
                                type="button"
                                onClick={() => setApplyErrorExpanded(!applyErrorExpanded)}
                                style={{
                                  fontSize: 12,
                                  padding: "4px 8px",
                                  border: "1px solid #c62828",
                                  borderRadius: 6,
                                  background: "#ffebee",
                                  color: "#c62828",
                                  cursor: "pointer",
                                }}
                              >
                                {applyErrorExpanded ? "閉じる" : "エラー詳細"}
                              </button>
                              {applyErrorExpanded && (
                                <pre
                                  style={{
                                    marginTop: 6,
                                    padding: 8,
                                    background: "#fff",
                                    border: "1px solid #ffcdd2",
                                    borderRadius: 6,
                                    fontSize: 12,
                                    overflow: "auto",
                                    whiteSpace: "pre-wrap",
                                  }}
                                >
                                  {applyError.stage === "network" && applyError.rawError
                                    ? [
                                        applyError.rawError.name != null ? `name: ${applyError.rawError.name}` : "",
                                        applyError.rawError.message != null ? `message: ${applyError.rawError.message}` : "",
                                        applyError.rawError.stack != null ? `stack:\n${applyError.rawError.stack}` : "",
                                      ]
                                        .filter(Boolean)
                                        .join("\n")
                                    : [
                                        applyError.endpoint != null ? `endpoint: ${applyError.endpoint}` : "",
                                        applyError.status != null ? `HTTP status: ${applyError.status}` : "",
                                        applyError.body != null ? `response body:\n${applyError.body}` : "",
                                      ]
                                        .filter(Boolean)
                                        .join("\n")}
                                </pre>
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={{ fontSize: 13, color: "#666" }}>現在のステータスが不明なため Apply できません</div>
                      )}
                    </>
                  )}
                </div>
              )}
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
