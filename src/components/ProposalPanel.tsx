"use client";

/**
 * Phase 4: 提案パネル（Proposal Panel）
 * Organizer / Advisor の提案生成を UI から実行し、rendered または errors を表示する。
 * 41_phase4_quality_pipeline.md §7、POST /api/organizer/run, /api/advisor/run を使用。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  /** Phase 5-A/5-B/5-C: relation + grouping + decomposition。VALID/NEEDS_REVIEW の Diff 一覧 */
  diffs?: OrganizerDiffItem[];
};

/** Phase 5-A/5-B/5-C: Organizer の 1 Diff（API の diffs[i] の形） */
type OrganizerDiffItem =
  | {
      diff_id: string;
      type: "relation";
      target_node_id: string;
      change: { action: string; from_node_id: string; to_node_id: string; relation_type: string };
      reason: string;
      risk?: string | null;
      validation?: { result: string; errors: string[]; warnings: string[] };
    }
  | {
      diff_id: string;
      type: "grouping";
      target_node_id: string;
      change: { group_label: string; node_ids: string[] };
      reason: string;
      risk?: string | null;
      validation?: { result: string; errors: string[]; warnings: string[] };
    }
  | {
      diff_id: string;
      type: "decomposition";
      target_node_id: string;
      change: {
        parent_node_id: string;
        add_children: Array<{ title: string; context?: string; suggested_status?: string }>;
      };
      reason: string;
      risk?: string | null;
      validation?: { result: string; errors: string[]; warnings: string[] };
    };

/** Phase7-A: GET /api/confirmations/history の 1 件 */
type ConfirmationHistoryItem = {
  confirmation_id: string;
  node_id: string;
  confirmed_at: string;
  consumed_at: string | null;
  proposed_change: Record<string, unknown>;
  ui_action: string;
};

/** Phase8-A: 履歴 1 件を OrganizerDiffItem に変換（再表示用）。type が relation/grouping/decomposition 以外は null */
function historyItemToOrganizerDiff(item: ConfirmationHistoryItem): OrganizerDiffItem | null {
  const pc = item.proposed_change;
  const type = typeof pc?.type === "string" ? pc.type : "";
  const diffId =
    typeof pc?.diff_id === "string" && pc.diff_id.trim()
      ? (pc.diff_id as string)
      : `restored-${item.confirmation_id}`;
  if (type === "relation") {
    const from_node_id = typeof pc?.from_node_id === "string" ? pc.from_node_id : "";
    const to_node_id = typeof pc?.to_node_id === "string" ? pc.to_node_id : "";
    const relation_type = typeof pc?.relation_type === "string" ? pc.relation_type : "";
    if (!from_node_id || !to_node_id || !relation_type) return null;
    return {
      diff_id: diffId,
      type: "relation",
      target_node_id: item.node_id,
      change: { action: "add", from_node_id, to_node_id, relation_type },
      reason: "（履歴から再表示）",
      risk: null,
    };
  }
  if (type === "grouping") {
    const group_label = typeof pc?.group_label === "string" ? pc.group_label : "";
    const node_ids = Array.isArray(pc?.node_ids)
      ? (pc.node_ids as unknown[]).map((id) => (typeof id === "string" ? id : "")).filter(Boolean)
      : [];
    if (!group_label || node_ids.length < 2) return null;
    return {
      diff_id: diffId,
      type: "grouping",
      target_node_id: item.node_id,
      change: { group_label, node_ids },
      reason: "（履歴から再表示）",
      risk: null,
    };
  }
  if (type === "decomposition") {
    const parent_node_id = typeof pc?.parent_node_id === "string" ? pc.parent_node_id : "";
    const rawChildren = Array.isArray(pc?.add_children)
      ? (pc.add_children as Array<{ title?: string; context?: string; suggested_status?: string }>)
      : [];
    const add_children: Array<{ title: string; context?: string; suggested_status?: string }> = rawChildren.map(
      (c) => ({ title: typeof c?.title === "string" ? c.title : "", context: c?.context, suggested_status: c?.suggested_status })
    );
    if (!parent_node_id || add_children.length === 0) return null;
    return {
      diff_id: diffId,
      type: "decomposition",
      target_node_id: item.node_id,
      change: { parent_node_id, add_children },
      reason: "（履歴から再表示）",
      risk: null,
    };
  }
  return null;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUuid(s: string): boolean {
  return UUID_REGEX.test(s.trim());
}

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
  organizer: "構成案",
  advisor: "判断案",
};

/** Phase9-A: 履歴 1 件クリック時にツリー連動用に渡す payload */
export type HistoryItemSelectPayload = { primaryNodeId: string; nodeIds: string[] };

export interface ProposalPanelProps {
  /** GET /api/dashboard の trays。null のときはパネルは「データなし」表示 */
  trays: Trays | null;
  /** Apply 成功時にダッシュボードを再取得するコールバック */
  onRefreshDashboard?: () => Promise<unknown>;
  /** Phase9-A: 履歴 1 件クリック時に該当 node_id を親に通知（ツリー展開・ハイライト・詳細表示用） */
  onHistoryItemSelect?: (payload: HistoryItemSelectPayload) => void;
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

/** Phase9-A: 履歴 1 件から primaryNodeId と nodeIds を導出（relation/grouping/decomposition のみ。status_change は null） */
function getHistoryItemNodeIds(item: ConfirmationHistoryItem): HistoryItemSelectPayload | null {
  const pc = item.proposed_change;
  const type = typeof pc?.type === "string" ? pc.type : "";
  if (type === "relation") {
    const from = typeof pc?.from_node_id === "string" ? pc.from_node_id : "";
    const to = typeof pc?.to_node_id === "string" ? pc.to_node_id : "";
    if (!from && !to) return null;
    const nodeIds = [from, to].filter(Boolean);
    return { primaryNodeId: from || to, nodeIds };
  }
  if (type === "grouping") {
    const node_ids = Array.isArray(pc?.node_ids)
      ? (pc.node_ids as unknown[]).map((id) => (typeof id === "string" ? id : "")).filter(Boolean)
      : [];
    if (node_ids.length === 0) return null;
    return { primaryNodeId: node_ids[0], nodeIds: [...node_ids] };
  }
  if (type === "decomposition") {
    const parent = typeof pc?.parent_node_id === "string" ? pc.parent_node_id : "";
    if (!parent) return null;
    return { primaryNodeId: parent, nodeIds: [parent] };
  }
  return null;
}

export function ProposalPanel({ trays, onRefreshDashboard, onHistoryItemSelect }: ProposalPanelProps) {
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
  /** Phase 5-A: relation Diff Apply 用 */
  const relationApplyInFlightRef = useRef(false);
  const [relationApplyLoading, setRelationApplyLoading] = useState(false);
  const [relationApplyError, setRelationApplyError] = useState<string | null>(null);
  const [relationApplySuccessMessage, setRelationApplySuccessMessage] = useState<string | null>(null);
  /** Phase 5-B: grouping Diff Apply 用（ref 分離） */
  const groupingApplyInFlightRef = useRef(false);
  const [groupingApplyLoading, setGroupingApplyLoading] = useState(false);
  const [groupingApplyError, setGroupingApplyError] = useState<string | null>(null);
  const [groupingApplySuccessMessage, setGroupingApplySuccessMessage] = useState<string | null>(null);
  /** Phase 5-C: decomposition Diff Apply 用（ref 分離） */
  const decompositionApplyInFlightRef = useRef(false);
  const [decompositionApplyLoading, setDecompositionApplyLoading] = useState(false);
  const [decompositionApplyError, setDecompositionApplyError] = useState<string | null>(null);
  const [decompositionApplySuccessMessage, setDecompositionApplySuccessMessage] = useState<string | null>(null);

  /** Phase7-A: 適用済み Diff 履歴 */
  const [historyItems, setHistoryItems] = useState<ConfirmationHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedHistoryConfirmationId, setSelectedHistoryConfirmationId] = useState<string | null>(null);
  /** Phase7-B: 履歴フィルタ */
  const [filterType, setFilterType] = useState<string>("");
  const [nodeIdFilter, setNodeIdFilter] = useState<string>("");
  const [nodeIdFilterError, setNodeIdFilterError] = useState<string | null>(null);

  /** Phase8-A: 履歴から再表示した Apply 候補 1 件 */
  const [restoredDiff, setRestoredDiff] = useState<OrganizerDiffItem | null>(null);

  /** Phase8-B: Apply 時の理由（任意）。Organizer 用と復元用 */
  const [relationApplyReason, setRelationApplyReason] = useState("");
  const [groupingApplyReason, setGroupingApplyReason] = useState("");
  const [decompositionApplyReason, setDecompositionApplyReason] = useState("");
  const [restoredApplyReason, setRestoredApplyReason] = useState("");

  const allNodes = useMemo(() => (trays ? flattenTrays(trays) : []), [trays]);
  const dashboardPayload = useMemo(
    () => (trays ? { trays } : null),
    [trays]
  );

  /** Phase7-A/7-B: 履歴を再取得。silent 時は loading 表示しない。overrides 指定時はその値でクエリを組み立て（クリア時用）。 */
  const fetchHistory = useCallback((silent?: boolean, overrides?: { filterType?: string; nodeIdFilter?: string }) => {
    if (!silent) {
      setHistoryLoading(true);
      setHistoryError(null);
    }
    const typeVal = overrides?.filterType !== undefined ? overrides.filterType : filterType;
    const nodeVal = overrides?.nodeIdFilter !== undefined ? overrides.nodeIdFilter : nodeIdFilter;
    const params = new URLSearchParams({ limit: "50" });
    if (typeVal && (typeVal === "relation" || typeVal === "grouping" || typeVal === "decomposition")) {
      params.set("type", typeVal);
    }
    const nodeIdTrimmed = String(nodeVal ?? "").trim();
    if (nodeIdTrimmed && isValidUuid(nodeIdTrimmed)) {
      params.set("node_id", nodeIdTrimmed);
    }
    const url = `/api/confirmations/history?${params.toString()}`;
    fetch(url)
      .then((res) => res.json())
      .then((data: { ok?: boolean; items?: ConfirmationHistoryItem[] }) => {
        if (data.ok && Array.isArray(data.items)) {
          setHistoryItems(data.items);
          if (!silent) setHistoryError(null);
        } else {
          setHistoryItems([]);
          setHistoryError("履歴の取得に失敗しました");
        }
      })
      .catch((err) => {
        console.error("history fetch error", err);
        setHistoryItems([]);
        setHistoryError("履歴の取得に失敗しました");
      })
      .finally(() => {
        if (!silent) setHistoryLoading(false);
      });
  }, [filterType, nodeIdFilter]);

  /** Phase7-A: Organizer タブ表示時に履歴を取得 */
  useEffect(() => {
    if (activeTab !== "organizer") return;
    fetchHistory();
  }, [activeTab, fetchHistory]);

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
    const fromLabel = (STATUS_LABELS as Record<string, string>)[from] ?? from;
    const toLabel = (STATUS_LABELS as Record<string, string>)[to] ?? to;
    const ok = window.confirm(
      `このタスクの状態を ${fromLabel} → ${toLabel} に変更します。よろしいですか？`
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
          message: "確認の取得に失敗しました",
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
            `反映しました（${fromLabel} → ${toLabel}）。現在: ${latestLabel}`
          );
        } else {
          setApplySuccessMessage(`反映しました（${fromLabel} → ${toLabel}）`);
        }
      } catch (_) {
        setApplySuccessMessage(
          "反映は成功しましたが、画面更新に失敗しました。再読み込みしてください"
        );
      }
    } finally {
      setApplyLoading(false);
      applyInFlightRef.current = false;
    }
  }, [advisorReport, applyTargetNode, applyToStatus, onRefreshDashboard]);

  const applyRelationDiff = useCallback(
    async (diff: OrganizerDiffItem, reasonOverride?: string) => {
      if (relationApplyInFlightRef.current) return;
      if (diff.type !== "relation" || !diff.change) return;
      const { from_node_id, to_node_id, relation_type } = diff.change;
      const fromShort = from_node_id.slice(0, 8);
      const toShort = to_node_id.slice(0, 8);
      const msg = `タスク「${fromShort}…」と「${toShort}…」の間に ${relation_type} を 1 本追加します。よろしいですか？`;
      relationApplyInFlightRef.current = true;
      const ok = window.confirm(msg);
      if (!ok) {
        relationApplyInFlightRef.current = false;
        return;
      }
      const reasonValue = reasonOverride !== undefined ? reasonOverride : relationApplyReason;
      setRelationApplyLoading(true);
      setRelationApplyError(null);
      setRelationApplySuccessMessage(null);
      try {
        const confRes = await fetch("/api/confirmations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            node_id: from_node_id,
            ui_action: "organizer_relation_apply",
            reason: reasonValue ?? "",
            proposed_change: {
              type: "relation",
              diff_id: diff.diff_id,
              from_node_id,
              to_node_id,
              relation_type,
            },
          }),
        });
        const confJson = await confRes.json().catch(() => ({}));
        if (!confRes.ok || !confJson.ok || !confJson.confirmation?.confirmation_id) {
          throw new Error(confJson.error || "確認の取得に失敗しました");
        }
        const applyRes = await fetch("/api/diffs/relation/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmation_id: confJson.confirmation.confirmation_id }),
        });
        const applyJson = await applyRes.json().catch(() => ({}));
        if (!applyRes.ok || !applyJson.ok) {
          throw new Error(applyJson.error || "反映に失敗しました");
        }
        if (onRefreshDashboard) await onRefreshDashboard();
        setRelationApplySuccessMessage(
          `反映しました（タスク識別子 … → タスク識別子 … / ${relation_type}）`
        );
        setRestoredDiff(null);
        fetchHistory(true);
      } catch (e) {
        setRelationApplyError(e instanceof Error ? e.message : String(e));
      } finally {
        setRelationApplyLoading(false);
        relationApplyInFlightRef.current = false;
      }
    },
    [onRefreshDashboard, fetchHistory, relationApplyReason]
  );

  const applyGroupingDiff = useCallback(
    async (diff: OrganizerDiffItem, reasonOverride?: string) => {
      if (groupingApplyInFlightRef.current) return;
      if (diff.type !== "grouping" || !diff.change) return;
      const { group_label, node_ids } = diff.change;
      const msg = `「${group_label}」で ${node_ids.length} 件のタスクをグループ化します。よろしいですか？`;
      groupingApplyInFlightRef.current = true;
      const ok = window.confirm(msg);
      if (!ok) {
        groupingApplyInFlightRef.current = false;
        return;
      }
      const reasonValue = reasonOverride !== undefined ? reasonOverride : groupingApplyReason;
      setGroupingApplyLoading(true);
      setGroupingApplyError(null);
      setGroupingApplySuccessMessage(null);
      try {
        const confRes = await fetch("/api/confirmations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ui_action: "organizer_grouping_apply",
            reason: reasonValue ?? "",
            proposed_change: {
              type: "grouping",
              diff_id: diff.diff_id,
              group_label,
              node_ids,
            },
          }),
        });
        const confJson = await confRes.json().catch(() => ({}));
        if (!confRes.ok || !confJson.ok || !confJson.confirmation?.confirmation_id) {
          throw new Error(confJson.error || "確認の取得に失敗しました");
        }
        const applyRes = await fetch("/api/diffs/grouping/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmation_id: confJson.confirmation.confirmation_id }),
        });
        const applyJson = await applyRes.json().catch(() => ({}));
        if (!applyRes.ok || !applyJson.ok) {
          throw new Error(applyJson.error || "反映に失敗しました");
        }
        if (onRefreshDashboard) await onRefreshDashboard();
        setGroupingApplySuccessMessage(`反映しました（${group_label}（${node_ids.length} 件））`);
        setRestoredDiff(null);
        fetchHistory(true);
      } catch (e) {
        setGroupingApplyError(e instanceof Error ? e.message : String(e));
      } finally {
        setGroupingApplyLoading(false);
        groupingApplyInFlightRef.current = false;
      }
    },
    [onRefreshDashboard, fetchHistory, groupingApplyReason]
  );

  const applyDecompositionDiff = useCallback(
    async (diff: OrganizerDiffItem, reasonOverride?: string) => {
      if (decompositionApplyInFlightRef.current) return;
      if (diff.type !== "decomposition" || !diff.change) return;
      const { parent_node_id, add_children } = diff.change;
      const msg = `親タスクに、子タスクを ${add_children.length} 件追加して紐づけます。よろしいですか？`;
      decompositionApplyInFlightRef.current = true;
      const ok = window.confirm(msg);
      if (!ok) {
        decompositionApplyInFlightRef.current = false;
        return;
      }
      const reasonValue = reasonOverride !== undefined ? reasonOverride : decompositionApplyReason;
      setDecompositionApplyLoading(true);
      setDecompositionApplyError(null);
      setDecompositionApplySuccessMessage(null);
      try {
        const confRes = await fetch("/api/confirmations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            node_id: parent_node_id,
            ui_action: "organizer_decomposition_apply",
            reason: reasonValue ?? "",
            proposed_change: {
              type: "decomposition",
              diff_id: diff.diff_id,
              parent_node_id,
              add_children,
            },
          }),
        });
        const confJson = await confRes.json().catch(() => ({}));
        if (!confRes.ok || !confJson.ok || !confJson.confirmation?.confirmation_id) {
          throw new Error(confJson.error || "確認の取得に失敗しました");
        }
        const applyRes = await fetch("/api/diffs/decomposition/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmation_id: confJson.confirmation.confirmation_id }),
        });
        const applyJson = await applyRes.json().catch(() => ({}));
        if (!applyRes.ok || !applyJson.ok) {
          throw new Error(applyJson.error || "反映に失敗しました");
        }
        if (onRefreshDashboard) await onRefreshDashboard();
        const createdCount = Array.isArray(applyJson.created_children) ? applyJson.created_children.length : 0;
        setDecompositionApplySuccessMessage(
          `反映しました（親タスクに子タスク ${createdCount} 件を追加）`
        );
        setRestoredDiff(null);
        fetchHistory(true);
      } catch (e) {
        setDecompositionApplyError(e instanceof Error ? e.message : String(e));
      } finally {
        setDecompositionApplyLoading(false);
        decompositionApplyInFlightRef.current = false;
      }
    },
    [onRefreshDashboard, fetchHistory, decompositionApplyReason]
  );

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
        <div style={{ fontWeight: 800, fontSize: 16 }}>提案パネル</div>
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
        提案パネル
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
          placeholder="例: 大きなタスクを分解して / このタスクの選択肢が知りたい"
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
              {organizerLoading ? "生成中…" : "構成案を生成"}
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
          {/* Phase8-A: 履歴から再表示した Apply 候補 1 件 */}
          {restoredDiff && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
                再表示した変更案（{restoredDiff.type === "relation" ? "関係の追加" : restoredDiff.type === "grouping" ? "グループ化" : "分解"}）
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {restoredDiff.type === "relation" && (
                  <div
                    style={{
                      padding: 12,
                      border: "1px solid #ddd",
                      borderRadius: 8,
                      background: "#fafafa",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: "#666" }}>
                        タスク {restoredDiff.change.from_node_id.slice(0, 8)}… → タスク {restoredDiff.change.to_node_id.slice(0, 8)}…
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{restoredDiff.change.relation_type}</span>
                    </div>
                    <div style={{ fontSize: 12, marginBottom: 8 }}>{restoredDiff.reason}</div>
                    <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 6 }}>
                      理由（任意）:
                      <input
                        type="text"
                        value={restoredApplyReason}
                        onChange={(e) => setRestoredApplyReason(e.target.value)}
                        placeholder="適用の理由を入力"
                        style={{ marginLeft: 6, padding: "4px 8px", width: "100%", maxWidth: 320, borderRadius: 4, border: "1px solid #ddd", fontSize: 12 }}
                      />
                    </label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => applyRelationDiff(restoredDiff, restoredApplyReason)}
                        disabled={relationApplyLoading}
                        style={{
                          padding: "6px 12px",
                          fontSize: 12,
                          border: "1px solid #5567ff",
                          borderRadius: 6,
                          background: relationApplyLoading ? "#ccc" : "#5567ff",
                          color: "white",
                          fontWeight: 600,
                          cursor: relationApplyLoading ? "not-allowed" : "pointer",
                        }}
                      >
                        {relationApplyLoading ? "反映中…" : "この変更を反映する"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRestoredDiff(null)}
                        style={{
                          padding: "6px 12px",
                          fontSize: 12,
                          border: "1px solid #999",
                          borderRadius: 6,
                          background: "#fff",
                          color: "#333",
                          cursor: "pointer",
                        }}
                      >
                        クリア
                      </button>
                    </div>
                  </div>
                )}
                {restoredDiff.type === "grouping" && (
                  <div
                    style={{
                      padding: 12,
                      border: "1px solid #ddd",
                      borderRadius: 8,
                      background: "#fafafa",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{restoredDiff.change.group_label}</span>
                      <span style={{ fontSize: 12, color: "#666" }}>（{restoredDiff.change.node_ids.length} 件）</span>
                    </div>
                    <div style={{ fontSize: 12, marginBottom: 8 }}>{restoredDiff.reason}</div>
                    <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 6 }}>
                      理由（任意）:
                      <input
                        type="text"
                        value={restoredApplyReason}
                        onChange={(e) => setRestoredApplyReason(e.target.value)}
                        placeholder="適用の理由を入力"
                        style={{ marginLeft: 6, padding: "4px 8px", width: "100%", maxWidth: 320, borderRadius: 4, border: "1px solid #ddd", fontSize: 12 }}
                      />
                    </label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => applyGroupingDiff(restoredDiff, restoredApplyReason)}
                        disabled={groupingApplyLoading}
                        style={{
                          padding: "6px 12px",
                          fontSize: 12,
                          border: "1px solid #5567ff",
                          borderRadius: 6,
                          background: groupingApplyLoading ? "#ccc" : "#5567ff",
                          color: "white",
                          fontWeight: 600,
                          cursor: groupingApplyLoading ? "not-allowed" : "pointer",
                        }}
                      >
                        {groupingApplyLoading ? "反映中…" : "この変更を反映する"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRestoredDiff(null)}
                        style={{
                          padding: "6px 12px",
                          fontSize: 12,
                          border: "1px solid #999",
                          borderRadius: 6,
                          background: "#fff",
                          color: "#333",
                          cursor: "pointer",
                        }}
                      >
                        クリア
                      </button>
                    </div>
                  </div>
                )}
                {restoredDiff.type === "decomposition" && (
                  <div
                    style={{
                      padding: 12,
                      border: "1px solid #ddd",
                      borderRadius: 8,
                      background: "#fafafa",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: "#666" }}>
                        親タスクに子タスク {restoredDiff.change.add_children.length} 件を追加
                      </span>
                    </div>
                    <div style={{ fontSize: 12, marginBottom: 4 }}>
                      {restoredDiff.change.add_children.map((c, i) => (
                        <span key={i} style={{ marginRight: 8 }}>
                          • {c.title}
                        </span>
                      ))}
                    </div>
                    <div style={{ fontSize: 12, marginBottom: 8 }}>{restoredDiff.reason}</div>
                    <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 6 }}>
                      理由（任意）:
                      <input
                        type="text"
                        value={restoredApplyReason}
                        onChange={(e) => setRestoredApplyReason(e.target.value)}
                        placeholder="適用の理由を入力"
                        style={{ marginLeft: 6, padding: "4px 8px", width: "100%", maxWidth: 320, borderRadius: 4, border: "1px solid #ddd", fontSize: 12 }}
                      />
                    </label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => applyDecompositionDiff(restoredDiff, restoredApplyReason)}
                        disabled={decompositionApplyLoading}
                        style={{
                          padding: "6px 12px",
                          fontSize: 12,
                          border: "1px solid #5567ff",
                          borderRadius: 6,
                          background: decompositionApplyLoading ? "#ccc" : "#5567ff",
                          color: "white",
                          fontWeight: 600,
                          cursor: decompositionApplyLoading ? "not-allowed" : "pointer",
                        }}
                      >
                        {decompositionApplyLoading ? "反映中…" : "この変更を反映する"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRestoredDiff(null)}
                        style={{
                          padding: "6px 12px",
                          fontSize: 12,
                          border: "1px solid #999",
                          borderRadius: 6,
                          background: "#fff",
                          color: "#333",
                          cursor: "pointer",
                        }}
                      >
                        クリア
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          {organizerResult?.ok && (organizerResult.diffs?.length ?? 0) > 0 && (
            <>
              {(organizerResult.diffs as OrganizerDiffItem[]).filter((d) => d.type === "relation").length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
                    反映できる変更案（関係の追加）
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {(organizerResult.diffs as OrganizerDiffItem[])
                      .filter((d) => d.type === "relation")
                      .map((diff) => (
                        <div
                          key={diff.diff_id}
                          style={{
                            padding: 12,
                            border: "1px solid #ddd",
                            borderRadius: 8,
                            background: "#fafafa",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                            <span style={{ fontSize: 12, color: "#666" }}>
                              タスク {diff.change.from_node_id.slice(0, 8)}… → タスク {diff.change.to_node_id.slice(0, 8)}…
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 700 }}>{diff.change.relation_type}</span>
                            {diff.validation?.result === "NEEDS_REVIEW" && (
                              <span
                                style={{
                                  fontSize: 11,
                                  padding: "2px 6px",
                                  background: "#fff3e0",
                                  color: "#e65100",
                                  borderRadius: 4,
                                }}
                              >
                                要確認
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 12, marginBottom: 8 }}>{diff.reason}</div>
                          {diff.validation?.warnings?.length ? (
                            <div style={{ fontSize: 11, color: "#e65100", marginBottom: 8 }}>
                              {diff.validation.warnings.join("; ")}
                            </div>
                          ) : null}
                          <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 6 }}>
                            理由（任意）:
                            <input
                              type="text"
                              value={relationApplyReason}
                              onChange={(e) => setRelationApplyReason(e.target.value)}
                              placeholder="適用の理由を入力"
                              style={{ marginLeft: 6, padding: "4px 8px", width: "100%", maxWidth: 320, borderRadius: 4, border: "1px solid #ddd", fontSize: 12 }}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => applyRelationDiff(diff)}
                            disabled={relationApplyLoading}
                            style={{
                              padding: "6px 12px",
                              fontSize: 12,
                              border: "1px solid #5567ff",
                              borderRadius: 6,
                              background: relationApplyLoading ? "#ccc" : "#5567ff",
                              color: "white",
                              fontWeight: 600,
                              cursor: relationApplyLoading ? "not-allowed" : "pointer",
                            }}
                          >
                            {relationApplyLoading ? "反映中…" : "この変更を反映する"}
                          </button>
                        </div>
                      ))}
                  </div>
                  {relationApplySuccessMessage && (
                    <div style={{ marginTop: 8, fontSize: 13, color: "#2e7d32" }}>
                      {relationApplySuccessMessage}
                    </div>
                  )}
                  {relationApplyError && (
                    <div style={{ marginTop: 8, fontSize: 13, color: "#c62828" }}>
                      {relationApplyError}
                    </div>
                  )}
                </div>
              )}
              {(organizerResult.diffs as OrganizerDiffItem[]).filter((d) => d.type === "grouping").length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
                    反映できる変更案（グループ化）
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {(organizerResult.diffs as OrganizerDiffItem[])
                      .filter((d) => d.type === "grouping")
                      .map((diff) => (
                        <div
                          key={diff.diff_id}
                          style={{
                            padding: 12,
                            border: "1px solid #ddd",
                            borderRadius: 8,
                            background: "#fafafa",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 700 }}>{diff.change.group_label}</span>
                            <span style={{ fontSize: 12, color: "#666" }}>（{diff.change.node_ids.length} 件）</span>
                            {diff.validation?.result === "NEEDS_REVIEW" && (
                              <span
                                style={{
                                  fontSize: 11,
                                  padding: "2px 6px",
                                  background: "#fff3e0",
                                  color: "#e65100",
                                  borderRadius: 4,
                                }}
                              >
                                要確認
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 12, marginBottom: 8 }}>{diff.reason}</div>
                          {diff.validation?.warnings?.length ? (
                            <div style={{ fontSize: 11, color: "#e65100", marginBottom: 8 }}>
                              {diff.validation.warnings.join("; ")}
                            </div>
                          ) : null}
                          <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 6 }}>
                            理由（任意）:
                            <input
                              type="text"
                              value={groupingApplyReason}
                              onChange={(e) => setGroupingApplyReason(e.target.value)}
                              placeholder="適用の理由を入力"
                              style={{ marginLeft: 6, padding: "4px 8px", width: "100%", maxWidth: 320, borderRadius: 4, border: "1px solid #ddd", fontSize: 12 }}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => applyGroupingDiff(diff)}
                            disabled={groupingApplyLoading}
                            style={{
                              padding: "6px 12px",
                              fontSize: 12,
                              border: "1px solid #5567ff",
                              borderRadius: 6,
                              background: groupingApplyLoading ? "#ccc" : "#5567ff",
                              color: "white",
                              fontWeight: 600,
                              cursor: groupingApplyLoading ? "not-allowed" : "pointer",
                            }}
                          >
                            {groupingApplyLoading ? "反映中…" : "この変更を反映する"}
                          </button>
                        </div>
                      ))}
                  </div>
                  {groupingApplySuccessMessage && (
                    <div style={{ marginTop: 8, fontSize: 13, color: "#2e7d32" }}>
                      {groupingApplySuccessMessage}
                    </div>
                  )}
                  {groupingApplyError && (
                    <div style={{ marginTop: 8, fontSize: 13, color: "#c62828" }}>
                      {groupingApplyError}
                    </div>
                  )}
                </div>
              )}
              {(organizerResult.diffs as OrganizerDiffItem[]).filter((d) => d.type === "decomposition").length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
                    反映できる変更案（分解）
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {(organizerResult.diffs as OrganizerDiffItem[])
                      .filter((d) => d.type === "decomposition")
                      .map((diff) => (
                        <div
                          key={diff.diff_id}
                          style={{
                            padding: 12,
                            border: "1px solid #ddd",
                            borderRadius: 8,
                            background: "#fafafa",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                            <span style={{ fontSize: 12, color: "#666" }}>
                              親タスクに子タスク {diff.change.add_children.length} 件を追加
                            </span>
                            {diff.validation?.result === "NEEDS_REVIEW" && (
                              <span
                                style={{
                                  fontSize: 11,
                                  padding: "2px 6px",
                                  background: "#fff3e0",
                                  color: "#e65100",
                                  borderRadius: 4,
                                }}
                              >
                                要確認
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 12, marginBottom: 4 }}>
                            {diff.change.add_children.map((c, i) => (
                              <span key={i} style={{ marginRight: 8 }}>
                                • {c.title}
                              </span>
                            ))}
                          </div>
                          <div style={{ fontSize: 12, marginBottom: 8 }}>{diff.reason}</div>
                          {diff.validation?.warnings?.length ? (
                            <div style={{ fontSize: 11, color: "#e65100", marginBottom: 8 }}>
                              {diff.validation.warnings.join("; ")}
                            </div>
                          ) : null}
                          <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 6 }}>
                            理由（任意）:
                            <input
                              type="text"
                              value={decompositionApplyReason}
                              onChange={(e) => setDecompositionApplyReason(e.target.value)}
                              placeholder="適用の理由を入力"
                              style={{ marginLeft: 6, padding: "4px 8px", width: "100%", maxWidth: 320, borderRadius: 4, border: "1px solid #ddd", fontSize: 12 }}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => applyDecompositionDiff(diff)}
                            disabled={decompositionApplyLoading}
                            style={{
                              padding: "6px 12px",
                              fontSize: 12,
                              border: "1px solid #5567ff",
                              borderRadius: 6,
                              background: decompositionApplyLoading ? "#ccc" : "#5567ff",
                              color: "white",
                              fontWeight: 600,
                              cursor: decompositionApplyLoading ? "not-allowed" : "pointer",
                            }}
                          >
                            {decompositionApplyLoading ? "反映中…" : "この変更を反映する"}
                          </button>
                        </div>
                      ))}
                  </div>
                  {decompositionApplySuccessMessage && (
                    <div style={{ marginTop: 8, fontSize: 13, color: "#2e7d32" }}>
                      {decompositionApplySuccessMessage}
                    </div>
                  )}
                  {decompositionApplyError && (
                    <div style={{ marginTop: 8, fontSize: 13, color: "#c62828" }}>
                      {decompositionApplyError}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Phase7-A/7-B: 反映した変更の履歴 */}
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid #ddd" }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
              反映した変更の履歴
            </div>
            {/* Phase7-B: フィルタ UI */}
            <div style={{ marginBottom: 10, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <label style={{ fontSize: 12, color: "#666" }}>
                種別:
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  style={{ marginLeft: 4, padding: "4px 8px", borderRadius: 4, border: "1px solid #ddd", fontSize: 12 }}
                >
                  <option value="">すべて</option>
                  <option value="relation">関連</option>
                  <option value="grouping">グループ化</option>
                  <option value="decomposition">分解</option>
                </select>
              </label>
              <label style={{ fontSize: 12, color: "#666" }}>
                対象のタスク:
                <input
                  type="text"
                  value={nodeIdFilter}
                  onChange={(e) => {
                    setNodeIdFilter(e.target.value);
                    setNodeIdFilterError(null);
                  }}
                  placeholder="タスクのID（任意）"
                  style={{ marginLeft: 4, padding: "4px 8px", width: 220, borderRadius: 4, border: "1px solid #ddd", fontSize: 12 }}
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  const trimmed = nodeIdFilter.trim();
                  if (trimmed && !isValidUuid(trimmed)) {
                    setNodeIdFilterError("タスクのIDの形式が正しくありません");
                    return;
                  }
                  setNodeIdFilterError(null);
                  fetchHistory();
                }}
                style={{ padding: "4px 12px", fontSize: 12, borderRadius: 4, border: "1px solid #5567ff", background: "#5567ff", color: "white", cursor: "pointer" }}
              >
                絞り込む
              </button>
              <button
                type="button"
                onClick={() => {
                  setFilterType("");
                  setNodeIdFilter("");
                  setNodeIdFilterError(null);
                  fetchHistory(undefined, { filterType: "", nodeIdFilter: "" });
                }}
                style={{ padding: "4px 12px", fontSize: 12, borderRadius: 4, border: "1px solid #999", background: "#fff", color: "#333", cursor: "pointer" }}
              >
                クリア
              </button>
              {nodeIdFilterError && (
                <span style={{ fontSize: 11, color: "#c62828" }}>{nodeIdFilterError}</span>
              )}
            </div>
            {historyLoading && (
              <div style={{ fontSize: 13, color: "#666" }}>読み込み中…</div>
            )}
            {!historyLoading && historyError && (
              <div style={{ fontSize: 13, color: "#c62828" }}>{historyError}</div>
            )}
            {!historyLoading && !historyError && historyItems.length === 0 && (
              <div style={{ fontSize: 13, color: "#666" }}>
                {filterType || nodeIdFilter.trim() ? "該当する履歴がありません" : "まだ反映した変更はありません"}
              </div>
            )}
            {!historyLoading && !historyError && historyItems.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {historyItems.map((item) => {
                  const pc = item.proposed_change;
                  const type = typeof pc?.type === "string" ? pc.type : "";
                  const dateStr = item.consumed_at || item.confirmed_at || "";
                  const typeLabel =
                    type === "relation"
                      ? "関係追加"
                      : type === "grouping"
                        ? "グループ化"
                        : type === "decomposition"
                          ? "分解"
                          : type || "—";
                  let summary = "—";
                  if (type === "relation" && pc?.from_node_id != null && pc?.to_node_id != null) {
                    summary = `タスク ${String(pc.from_node_id).slice(0, 8)}… → タスク ${String(pc.to_node_id).slice(0, 8)}… ${String(pc.relation_type ?? "")}`;
                  } else if (type === "grouping" && pc?.group_label != null) {
                    const n = Array.isArray(pc.node_ids) ? pc.node_ids.length : 0;
                    summary = `${String(pc.group_label)}（${n}件）`;
                  } else if (type === "decomposition" && pc?.parent_node_id != null) {
                    const children = Array.isArray(pc.add_children) ? pc.add_children.length : 0;
                    summary = `親タスクに子 ${children} 件を追加`;
                  }
                  const isSelected = selectedHistoryConfirmationId === item.confirmation_id;
                  return (
                    <div
                      key={item.confirmation_id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedHistoryConfirmationId(null);
                        } else {
                          setSelectedHistoryConfirmationId(item.confirmation_id);
                          const payload = getHistoryItemNodeIds(item);
                          if (payload) onHistoryItemSelect?.(payload);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          if (isSelected) {
                            setSelectedHistoryConfirmationId(null);
                          } else {
                            setSelectedHistoryConfirmationId(item.confirmation_id);
                            const payload = getHistoryItemNodeIds(item);
                            if (payload) onHistoryItemSelect?.(payload);
                          }
                        }
                      }}
                      style={{
                        padding: 10,
                        border: `1px solid ${isSelected ? "#5567ff" : "#ddd"}`,
                        borderRadius: 6,
                        background: isSelected ? "#e8eaf6" : "#fafafa",
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
                        <span style={{ color: "#666" }}>{dateStr.slice(0, 19).replace("T", " ")}</span>
                        <span style={{ fontWeight: 700 }}>{typeLabel}</span>
                        <span>{summary}</span>
                      </div>
                      {isSelected && (
                        <div
                          style={{
                            marginTop: 8,
                            padding: 8,
                            background: "#fff",
                            borderRadius: 4,
                            border: "1px solid #ddd",
                            fontSize: 11,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-all",
                          }}
                        >
                          {type === "relation" && (
                            <>
                              元のタスク: {String(pc?.from_node_id ?? "—")}
                              {"\n"}
                              先のタスク: {String(pc?.to_node_id ?? "—")}
                              {"\n"}
                              関係の種類: {String(pc?.relation_type ?? "—")}
                              {"\n"}
                              変更ID: {String(pc?.diff_id ?? "—")}
                            </>
                          )}
                          {type === "grouping" && (
                            <>
                              グループ名: {String(pc?.group_label ?? "—")}
                              {"\n"}
                              タスク一覧: {Array.isArray(pc?.node_ids) ? pc.node_ids.join(", ") : "—"}
                              {"\n"}
                              変更ID: {String(pc?.diff_id ?? "—")}
                            </>
                          )}
                          {type === "decomposition" && (
                            <>
                              <div>親タスク: {String(pc?.parent_node_id ?? "—")}</div>
                              <div>
                                追加する子（タイトル）:
                                {Array.isArray(pc?.add_children)
                                  ? pc.add_children.map((c: { title?: string }, i: number) => (
                                      <span key={i}> {String(c?.title ?? "—")}; </span>
                                    ))
                                  : " —"}
                              </div>
                              <div>変更ID: {String(pc?.diff_id ?? "—")}</div>
                            </>
                          )}
                          {(type === "relation" || type === "grouping" || type === "decomposition") &&
                            pc?.reason != null &&
                            String(pc.reason).trim() !== "" && (
                              <div style={{ marginTop: 6 }}>
                                理由: {String(pc.reason)}
                              </div>
                            )}
                          {(type === "relation" || type === "grouping" || type === "decomposition") && (
                            <div style={{ marginTop: 8 }}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const converted = historyItemToOrganizerDiff(item);
                                  if (converted) setRestoredDiff(converted);
                                }}
                                style={{
                                  padding: "6px 12px",
                                  fontSize: 12,
                                  border: "1px solid #5567ff",
                                  borderRadius: 6,
                                  background: "#5567ff",
                                  color: "white",
                                  cursor: "pointer",
                                }}
                              >
                                この変更を候補に再表示する
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Advisor セクション */}
      {activeTab === "advisor" && (
        <div>
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 4 }}>
              対象のタスク（未指定なら 1 件目）
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
                  タスク {n.id.slice(0, 8)}… {String(n.title ?? "").slice(0, 20) || "(無題)"}
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
              {advisorLoading ? "生成中…" : "判断案を生成"}
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
                  <div style={{ fontSize: 12, color: "#1b5e20", marginBottom: 8 }}>状態を変更する</div>
                  {!applyTargetNode ? (
                    <div style={{ fontSize: 13, color: "#c62828" }}>対象のタスクが見つかりません</div>
                  ) : (
                    <>
                      <div style={{ fontSize: 13, marginBottom: 6 }}>
                        現在の状態: <b>{(STATUS_LABELS as Record<string, string>)[applyTargetNode.status ?? ""] ?? "—"}</b>
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
                                {(STATUS_LABELS as Record<string, string>)[s] ?? s}
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
                              {applyLoading ? "反映中…" : "反映する"}
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
                        <div style={{ fontSize: 13, color: "#666" }}>現在の状態が分からないため反映できません</div>
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
