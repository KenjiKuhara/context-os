"use client";

/**
 * Dashboard — 「進行中の仕事」を一望するページ
 *
 * Based on:
 *   00_Vision_NorthStar.md §4 — 「今なにやる？」の材料を一覧化
 *   03_Non_Goals.md §2.2      — status を人に選ばせない（ドロップダウン禁止）
 *   03_Non_Goals.md §4.1      — リッチ UI を作らない（最小限）
 *   04_Domain_Model.md §3     — Node の主要属性（title / context / status / temperature）
 *   05_State_Machine.md       — 15 状態のラベル表示
 *   09_API_Contract.md §7     — estimate-status API 経由で status を変更
 *   10_Architecture.md §3.1   — 状態の確定は App、人は「違う」と指摘するだけ
 *
 * Key design decision (Non-Goals §2.2):
 *   人は status を「選ぶ」のではなく、
 *   intent（何が起きたか）を入力し、
 *   AI/App が推定した候補を「確認」するだけ。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { STATUS_LABELS, getValidTransitions } from "@/lib/stateMachine";
import { ProposalPanel } from "@/components/ProposalPanel";
import { TreeList } from "@/components/TreeList";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { QuickAdd } from "@/components/QuickAdd";
import { StatusQuickSwitch } from "@/components/StatusQuickSwitch";
import { buildTree, type TreeNode } from "@/lib/dashboardTree";
import type { HistoryItemSelectPayload } from "@/components/ProposalPanel";

// ─── Types ──────────────────────────────────────────────────
// Node attributes based on 04_Domain_Model.md §3

type Node = {
  id: string;
  title?: string | null;
  name?: string | null;      // DB 互換（旧カラム名フォールバック）
  context?: string | null;   // 途中内容（04_Domain_Model §3.1 の第一級属性）
  status: string;
  temperature?: number | null;
  note?: string | null;      // 簡易メモ（domain 外だが DB 互換で残す）
  updated_at?: string | null;
  parent_id?: string | null; // Phase6-A ツリー用
  sibling_order?: number | null;
  created_at?: string | null;
  /** 最後に追加したメモ（node_status_history の最新 reason）。一覧・詳細で優先表示 */
  last_memo?: string | null;
  /** 最後のメモ／ステータス更新の時刻（node_status_history.consumed_at）。「更新」の相対表示に使用 */
  last_memo_at?: string | null;
  /** 期日（YYYY-MM-DD）。未設定は null */
  due_date?: string | null;
};

type Trays = {
  in_progress: Node[];
  needs_decision: Node[];
  waiting_external: Node[];
  cooling: Node[];
  other_active: Node[];
};

// estimate-status API レスポンス型
type StatusCandidate = { status: string; label: string };

type EstimatePreview = {
  ok: boolean;
  applied: false;
  current_status: string;
  current_label: string;
  suggested: { status: string; label: string; reason: string } | null;
  candidates: StatusCandidate[];
};

// ─── Labels ─────────────────────────────────────────────────
// STATUS_LABELS は stateMachine.ts から import（05_State_Machine.md §6 SSOT 原則）
// トレーラベルはダッシュボード固有（09_API_Contract.md §9 トレー分類根拠）

/** Phase6-B: ツリー開閉状態の永続化（72 準拠） */
const TREE_EXPANDED_STORAGE_KEY = "kuharaos.tree.expanded.v1";
/** Phase11-E: 大賢者メッセージ再出現制御（lastHandledSageKind + timestamp） */
const SAGE_LAST_HANDLED_KEY = "kuharaos.sage.lastHandled";

/** Phase9-A: treeRoots から ノード→親 マップを構築 */
function buildParentById(roots: TreeNode[]): Map<string, string> {
  const m = new Map<string, string>();
  function walk(nodes: TreeNode[], parentId: string | null) {
    for (const tn of nodes) {
      if (parentId != null) m.set(tn.id, parentId);
      walk(tn.children, tn.id);
    }
  }
  walk(roots, null);
  return m;
}

/** Phase9-A: 指定ノードの祖先 ID をルート方向に並べた配列（展開用） */
function getAncestorIds(nodeId: string, parentById: Map<string, string>): string[] {
  const out: string[] = [];
  let current: string | undefined = nodeId;
  while (current) {
    const parent = parentById.get(current);
    if (!parent) break;
    out.push(parent);
    current = parent;
  }
  return out;
}

const TRAY_LABEL: Record<keyof Trays | "all", string> = {
  all: "全て（進行中の仕事）",
  in_progress: "実施中",
  needs_decision: "判断待ち",
  waiting_external: "外部待ち",
  cooling: "冷却中",
  other_active: "その他",
};

/** Phase11-D: 滞留検知メッセージの閾値 */
const READY_THRESHOLD = 3;
const NEEDS_DECISION_THRESHOLD = 2;
const IN_PROGRESS_STALE_MINUTES = 60;

// ─── Helpers ────────────────────────────────────────────────

function getNodeTitle(n: Node): string {
  return n.title ?? n.name ?? "(タイトルなし)";
}

function formatDueDateDisplay(dueDate: string | null | undefined): string {
  if (dueDate == null || dueDate === "") return "未設定";
  const s = dueDate.trim();
  if (!s) return "未設定";
  return s.replace(/-/g, "/");
}

function getStatusLabel(status: string): string {
  return (STATUS_LABELS as Record<string, string>)[status] ?? status;
}

/** B4: 状態 → トークン（118 で明文化）。成功/危険/要注目はセマンティックに、それ以外は中性。 */
function getStatusBadgeStyle(status: string): { background: string; color: string } {
  if (status === "DONE") return { background: "var(--bg-success)", color: "var(--text-success)" };
  if (status === "CANCELLED") return { background: "var(--bg-danger)", color: "var(--text-danger)" };
  if (["BLOCKED", "NEEDS_DECISION", "NEEDS_REVIEW"].includes(status))
    return { background: "var(--bg-warning)", color: "var(--text-warning)" };
  return { background: "var(--bg-badge)", color: "var(--text-primary)" };
}

function getNodeSubtext(n: Node): string {
  // 最後に追加したメモ（推定する／この状態にするで記録）を優先。なければ途中内容・note
  return n.last_memo ?? n.context ?? n.note ?? "";
}

/** 最終観測と同じ仕様：ISO 日時から「たった今」「N分前」「N時間前」「N日以上前」を返す */
function formatRelativeTime(isoString: string | null | undefined): string {
  if (!isoString) return "（不明）";
  try {
    const t = new Date(isoString).getTime();
    const now = Date.now();
    const minutes = Math.floor((now - t) / 60_000);
    if (minutes < 1) return "たった今";
    if (minutes < 60) return `${minutes}分前`;
    if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}時間前`;
    return `${Math.floor(minutes / (24 * 60))}日以上前`;
  } catch {
    return "（不明）";
  }
}

/** 最終更新表示用：日付・時刻と相対時間を組み合わせて「2026/2/14 16:32:10（11分前）」形式で返す */
function formatLastUpdated(isoString: string | null | undefined): string {
  if (!isoString) return "（不明）";
  try {
    const d = new Date(isoString);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const h = d.getHours();
    const min = String(d.getMinutes()).padStart(2, "0");
    const sec = String(d.getSeconds()).padStart(2, "0");
    const absolute = `${y}/${m}/${day} ${h}:${min}:${sec}`;
    const relative = formatRelativeTime(isoString);
    return `${absolute}（${relative}）`;
  } catch {
    return "（不明）";
  }
}

/** Phase10-A: 履歴 1 件の種別ラベル（102 設計 §4） */
function getRelatedHistoryTypeLabel(pc: Record<string, unknown>): string {
  const t = typeof pc?.type === "string" ? pc.type : "";
  if (t === "relation") return "関係追加";
  if (t === "grouping") return "グループ化";
  if (t === "decomposition") return "分解";
  return t || "—";
}

/** Phase10-A: 履歴 1 件の要約 1 行（102 設計 §4） */
function getRelatedHistorySummary(pc: Record<string, unknown>): string {
  const type = typeof pc?.type === "string" ? pc.type : "";
  if (type === "relation") {
    const from = String(pc?.from_node_id ?? "").slice(0, 8);
    const to = String(pc?.to_node_id ?? "").slice(0, 8);
    const rel = String(pc?.relation_type ?? "");
    return `${from}… → ${to}… ${rel}`.trim();
  }
  if (type === "grouping") {
    const label = String(pc?.group_label ?? "");
    const n = Array.isArray(pc?.node_ids) ? (pc.node_ids as unknown[]).length : 0;
    return `${label}（${n}件）`;
  }
  if (type === "decomposition") {
    const parent = String(pc?.parent_node_id ?? "").slice(0, 8);
    const n = Array.isArray(pc?.add_children) ? (pc.add_children as unknown[]).length : 0;
    return `親 ${parent}… に子 ${n}件`;
  }
  return "—";
}

function findNodeInTrays(trays: Trays, id: string): Node | null {
  const all = [
    ...trays.in_progress,
    ...trays.needs_decision,
    ...trays.waiting_external,
    ...trays.cooling,
    ...trays.other_active,
  ];
  return all.find((n) => n.id === id) ?? null;
}

// ─── Sub-components ─────────────────────────────────────────

function SummaryCard({
  title,
  value,
  onClick,
  active,
}: {
  title: string;
  value: number;
  onClick: () => void;
  active: boolean;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        border: active ? "2px solid var(--border-focus)" : "1px solid var(--border-default)",
        borderRadius: 10,
        padding: 12,
        minWidth: 150,
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 900 }}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { background, color } = getStatusBadgeStyle(status);
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 6,
        background,
        color,
        fontSize: 13,
        fontWeight: 700,
      }}
    >
      {getStatusLabel(status)}
    </span>
  );
}

// ─── Main ───────────────────────────────────────────────────

export default function DashboardPage() {
  const [mounted, setMounted] = useState(false);
  const [trays, setTrays] = useState<Trays | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tray filter
  const [activeTrayKey, setActiveTrayKey] = useState<keyof Trays | "all">(
    "all"
  );
  const [selected, setSelected] = useState<Node | null>(null);

  // Phase14-QuickAdd
  const [quickAddValue, setQuickAddValue] = useState("");
  const [optimisticNodes, setOptimisticNodes] = useState<Node[]>([]);
  const [quickAddSending, setQuickAddSending] = useState(false);
  const quickAddInputRef = useRef<HTMLInputElement>(null);
  const quickAddLastSentAtRef = useRef(0);

  // Phase15-StatusQuickSwitch: optimistic 表示 + last-write-wins
  const [optimisticStatusOverrides, setOptimisticStatusOverrides] = useState<Record<string, string>>({});
  const [quickSwitchError, setQuickSwitchError] = useState<string | null>(null);
  /** Phase12-A: 更新中は全状態ボタン非活性（エラーは出さない） */
  const [quickSwitchInFlightNodeId, setQuickSwitchInFlightNodeId] = useState<string | null>(null);
  const lastQuickSwitchRequestIdRef = useRef(0);

  // Estimate flow state
  // 03_Non_Goals.md §2.2: status を人に選ばせない
  // → intent テキスト入力 → 推定 → 確認/指摘
  const [intentDraft, setIntentDraft] = useState("");
  const [estimateResult, setEstimateResult] = useState<EstimatePreview | null>(
    null
  );
  const [estimatePhase, setEstimatePhase] = useState<
    "idle" | "loading" | "preview" | "applying"
  >("idle");
  const [showCandidates, setShowCandidates] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  /** 「この状態にする」押下後の確認モーダル。Enter→OK / Escape→キャンセル を効かせるため window.confirm の代わりに使用 */
  const [confirmApply, setConfirmApply] = useState<{
    targetStatus: string;
    fromLabel: string;
    toLabel: string;
  } | null>(null);

  // Observer report state (Phase 3-0〜3-4)
  // 19_SubAgent_Observer.md §6: 人間 UI との関係
  // 表示条件: (1) 取得失敗 → observerError を表示 (2) report が null → レポートなし (3) あり → 最新 1 件を表示（created_at で新旧が分かる）
  const [observerReport, setObserverReport] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [observerLoading, setObserverLoading] = useState(false);
  const [observerError, setObserverError] = useState<string | null>(null);
  const [observerWarningExpanded, setObserverWarningExpanded] = useState<number | null>(null);

  // Phase6-A: ツリー表示用
  const [nodeChildren, setNodeChildren] = useState<Array<{ parent_id: string; child_id: string; created_at?: string }>>([]);
  const [viewMode, setViewMode] = useState<"flat" | "tree">("tree");
  const [expandedSet, setExpandedSet] = useState<Set<string>>(new Set());
  const hasRestoredExpandedRef = useRef(false);
  /** Phase9-A: 履歴クリック連動でハイライトするノード ID の集合 */
  const [highlightNodeIds, setHighlightNodeIds] = useState<Set<string> | null>(null);
  /** Phase11-D: 大賢者アクションクリック後、トレー切替完了時にフォーカスするノード ID */
  const pendingSageFocusNodeIdRef = useRef<string | null>(null);
  /** Phase12-D: 親 READY→IN_PROGRESS 自動遷移の二重実行防止 */
  const parentAutoProgressInFlightRef = useRef(false);

  /** Phase10-A: ノード詳細に関連する直近履歴 1 件 */
  const [relatedRecentHistory, setRelatedRecentHistory] = useState<{
    confirmation_id: string;
    node_id: string;
    confirmed_at: string;
    consumed_at: string | null;
    proposed_change: Record<string, unknown>;
    ui_action?: string;
  } | null>(null);
  const [relatedRecentHistoryLoading, setRelatedRecentHistoryLoading] = useState(false);
  const [relatedRecentHistoryError, setRelatedRecentHistoryError] = useState<string | null>(null);

  /** ステータス・メモログ（推定するボタン下）。node_status_history を新しい順で表示 */
  const [statusLog, setStatusLog] = useState<Array<{
    from_status: string;
    to_status: string;
    reason: string;
    consumed_at: string | null;
  }>>([]);
  const [statusLogLoading, setStatusLogLoading] = useState(false);
  const [statusLogError, setStatusLogError] = useState<string | null>(null);
  const [statusLogRefreshKey, setStatusLogRefreshKey] = useState(0);

  /** タスクタイトル インライン編集: 編集中のノード ID。null のときは表示モード */
  const [titleEditingNodeId, setTitleEditingNodeId] = useState<string | null>(null);
  /** タイトル保存中フラグ。Enter 保存直後の blur で二重保存しないため */
  const [titleSaveInFlight, setTitleSaveInFlight] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  /** 期日編集モード（編集中のノード ID） */
  const [dueDateEditingNodeId, setDueDateEditingNodeId] = useState<string | null>(null);
  /** 期日保存中フラグ。二重保存防止 */
  const [dueDateSaveInFlight, setDueDateSaveInFlight] = useState(false);
  const dueDateInputRef = useRef<HTMLInputElement>(null);

  // ─── Data fetch ─────────────────────────────────────────

  const refreshDashboard = useCallback(async () => {
    const res = await fetch("/api/dashboard", { cache: "no-store" });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "API error");
    setTrays(json.trays as Trays);
    setNodeChildren(Array.isArray(json.node_children) ? json.node_children : []);
    return json.trays as Trays;
  }, []);

  /** Phase12-D: 子更新後に親が READY なら自動で IN_PROGRESS へ。既存 API/履歴使用。二重実行防止あり。 */
  const ensureParentInProgress = useCallback(
    (
      childNodeId: string,
      newTrays: Trays | null,
      links: Array<{ parent_id: string; child_id: string }>,
      parentIdFromNode?: string | null
    ) => {
      if (!newTrays) return;
      const link = links.find((l) => l.child_id === childNodeId);
      const parentId = link?.parent_id ?? parentIdFromNode ?? null;
      if (!parentId) return;
      const allNodes: Node[] = [
        ...newTrays.in_progress,
        ...newTrays.needs_decision,
        ...newTrays.waiting_external,
        ...newTrays.cooling,
        ...newTrays.other_active,
      ];
      const parent = allNodes.find((n) => n.id === parentId) as Node | undefined;
      if (!parent || parent.status !== "READY") return;
      if (parentAutoProgressInFlightRef.current) return;
      parentAutoProgressInFlightRef.current = true;
      fetch("/api/confirmations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          node_id: parentId,
          ui_action: "dashboard_parent_auto_in_progress",
          proposed_change: { type: "status_change", from: "READY", to: "IN_PROGRESS" },
        }),
      })
        .then((res) => res.json())
        .then((confJson: { ok?: boolean; confirmation?: { confirmation_id?: string }; error?: string }) => {
          if (!confJson.ok || !confJson.confirmation?.confirmation_id)
            throw new Error(confJson.error ?? "confirmation failed");
          return confJson.confirmation!.confirmation_id as string;
        })
        .then((confirmationId) =>
          fetch(`/api/nodes/${parentId}/estimate-status`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              intent: "子タスクの更新に伴い実施中へ",
              confirm_status: "IN_PROGRESS",
              reason: "子タスクの更新に伴い実施中へ",
              source: "human_ui",
              confirmation_id: confirmationId,
            }),
          }).then((res) => res.json())
        )
        .then((json: { ok?: boolean; error?: string }) => {
          if (!json.ok) throw new Error(json.error ?? "apply failed");
          return refreshDashboard();
        })
        .catch((err) => {
          console.warn("[Phase12-D] ensureParentInProgress failed", err);
        })
        .finally(() => {
          parentAutoProgressInFlightRef.current = false;
        });
    },
    [refreshDashboard]
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchObserverReport = useCallback(async () => {
    setObserverLoading(true);
    setObserverError(null);
    try {
      const res = await fetch("/api/observer/reports/latest", {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) {
        setObserverError(json.error ?? "Observer report not found");
        setObserverReport(null);
        return;
      }
      if (!json.ok) {
        setObserverError(json.error ?? "Observer report not found");
        setObserverReport(null);
        return;
      }
      if (json.report == null) {
        setObserverReport(null);
        setObserverError((json.message as string) ?? "Observer report not found");
        return;
      }
      setObserverReport(json.report);
      setObserverError(null);
    } catch {
      setObserverError("Observer report not found");
      setObserverReport(null);
    } finally {
      setObserverLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        await refreshDashboard();
        if (cancelled) return;
        await fetchObserverReport();
      } catch (e: unknown) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [mounted, refreshDashboard, fetchObserverReport]);

  // ─── Reset estimate flow when selection changes ─────────

  useEffect(() => {
    setIntentDraft("");
    setEstimateResult(null);
    setEstimatePhase("idle");
    setShowCandidates(false);
    setResultMessage(null);
    setQuickSwitchError(null);
  }, [selected]);

  // Phase10-A: 選択ノードに関連する直近履歴 1 件を取得
  useEffect(() => {
    const nodeId = selected?.id;
    if (!nodeId) {
      setRelatedRecentHistory(null);
      setRelatedRecentHistoryLoading(false);
      setRelatedRecentHistoryError(null);
      return;
    }
    let cancelled = false;
    setRelatedRecentHistoryLoading(true);
    setRelatedRecentHistoryError(null);
    setRelatedRecentHistory(null);
    const url = `/api/confirmations/history?node_id=${encodeURIComponent(nodeId)}&limit=1`;
    fetch(url, { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { ok?: boolean; error?: string; items?: unknown[] }) => {
        if (cancelled) return;
        setRelatedRecentHistoryLoading(false);
        if (!data.ok) {
          setRelatedRecentHistoryError(data.error ?? "取得できませんでした");
          setRelatedRecentHistory(null);
          return;
        }
        const items = Array.isArray(data.items) ? data.items : [];
        const first = items[0];
        if (first && typeof first === "object" && first !== null && "confirmation_id" in first) {
          setRelatedRecentHistory(first as {
            confirmation_id: string;
            node_id: string;
            confirmed_at: string;
            consumed_at: string | null;
            proposed_change: Record<string, unknown>;
            ui_action?: string;
          });
          setRelatedRecentHistoryError(null);
        } else {
          setRelatedRecentHistory(null);
          setRelatedRecentHistoryError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRelatedRecentHistoryLoading(false);
          setRelatedRecentHistoryError("取得できませんでした");
          setRelatedRecentHistory(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.id]);

  // ステータス・メモログ（node_status_history）を取得。選択変更 or 更新後に再取得
  useEffect(() => {
    const nodeId = selected?.id;
    if (!nodeId) {
      setStatusLog([]);
      setStatusLogLoading(false);
      setStatusLogError(null);
      return;
    }
    let cancelled = false;
    setStatusLogLoading(true);
    setStatusLogError(null);
    fetch(`/api/nodes/${encodeURIComponent(nodeId)}/history`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { ok?: boolean; error?: string; items?: Array<{ from_status: string; to_status: string; reason: string; consumed_at: string | null }> }) => {
        if (cancelled) return;
        setStatusLogLoading(false);
        if (!data.ok) {
          setStatusLogError(data.error ?? "取得できませんでした");
          setStatusLog([]);
          return;
        }
        setStatusLog(Array.isArray(data.items) ? data.items : []);
        setStatusLogError(null);
      })
      .catch(() => {
        if (!cancelled) {
          setStatusLogLoading(false);
          setStatusLogError("取得できませんでした");
          setStatusLog([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.id, statusLogRefreshKey]);

  useEffect(() => {
    if (titleEditingNodeId && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [titleEditingNodeId]);

  useEffect(() => {
    if (dueDateEditingNodeId && dueDateInputRef.current) {
      dueDateInputRef.current.focus();
    }
  }, [dueDateEditingNodeId]);

  // Phase14-QuickAdd / Phase15-P0: 親選択中は parent_id 付与で子として追加。二重送信は300ms連打のみ防止。
  const handleQuickAddSubmit = useCallback(() => {
    const title = quickAddValue.trim();
    if (!title) return;
    const now = Date.now();
    if (quickAddSending && now - quickAddLastSentAtRef.current < 300) return;
    const parentId = selected?.id ?? null;
    setQuickAddSending(true);
    quickAddLastSentAtRef.current = now;
    setQuickAddValue("");
    const tempId = `quickadd-${now}`;
    const tempNode: Node = {
      id: tempId,
      title,
      status: "READY",
      context: null,
      parent_id: parentId,
      sibling_order: null,
      updated_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    setOptimisticNodes((prev) => [tempNode, ...prev]);
    quickAddInputRef.current?.focus();
    fetch("/api/nodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, status: "READY", parent_id: parentId }),
    })
      .then((res) => res.json())
      .then((json: { ok?: boolean; error?: string }) => {
        if (json.ok) return refreshDashboard();
        throw new Error(json.error ?? "failed");
      })
      .then(() => setOptimisticNodes((prev) => prev.filter((n) => n.id !== tempId)))
      .catch(() => setOptimisticNodes((prev) => prev.filter((n) => n.id !== tempId)))
      .finally(() => setQuickAddSending(false));
  }, [quickAddValue, quickAddSending, selected?.id, refreshDashboard]);

  // Phase15-StatusQuickSwitch: 表示用 status（optimistic 上書きあり）
  const displayStatus = useCallback(
    (node: Node | null) => (node ? optimisticStatusOverrides[node.id] ?? node.status : ""),
    [optimisticStatusOverrides]
  );

  const handleQuickSwitchClick = useCallback(
    (targetStatus: string) => {
      if (!selected) return;
      const currentDisplay = displayStatus(selected);
      if (targetStatus === currentDisplay) return;
      const nodeId = selected.id;
      setQuickSwitchError(null);
      setQuickSwitchInFlightNodeId(nodeId);
      setOptimisticStatusOverrides((prev) => ({ ...prev, [nodeId]: targetStatus }));
      const requestId = ++lastQuickSwitchRequestIdRef.current;
      // Phase 2-γ: confirmation_events に先に 1 件挿入し、返却された confirmation_id で estimate-status を呼ぶ
      const createConfirmation = () =>
        fetch("/api/confirmations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            node_id: nodeId,
            ui_action: "dashboard_status_quick_switch",
            proposed_change: { type: "status_change", from: selected.status, to: targetStatus },
          }),
        })
          .then((res) => res.json())
          .then((confJson: { ok?: boolean; confirmation?: { confirmation_id?: string }; error?: string; current_status?: string }) => {
            if (!confJson.ok || !confJson.confirmation?.confirmation_id) throw confJson;
            return confJson.confirmation.confirmation_id as string;
          });
      const ALREADY_IN_TARGET = { _alreadyInTarget: true } as const;
      createConfirmation()
        .catch((confErr: { ok?: boolean; error?: string; current_status?: string }) => {
          // 既に DB が目標状態の場合は成功扱い（二重クリックや他タブで更新済み）
          if (requestId !== lastQuickSwitchRequestIdRef.current) throw confErr;
          if (confErr?.current_status === targetStatus) return ALREADY_IN_TARGET;
          throw confErr;
        })
        .then((confirmationIdOrSentinel) => {
          if (confirmationIdOrSentinel === ALREADY_IN_TARGET) {
            return refreshDashboard().then((newTrays) => {
              if (requestId !== lastQuickSwitchRequestIdRef.current) return;
              setQuickSwitchInFlightNodeId(null);
              if (newTrays) {
                const latest = findNodeInTrays(newTrays, nodeId);
                if (latest) setSelected(latest);
                ensureParentInProgress(nodeId, newTrays, nodeChildren, selected?.parent_id ?? undefined);
              }
              setOptimisticStatusOverrides((prev) => {
                const next = { ...prev };
                delete next[nodeId];
                return next;
              });
              setStatusLogRefreshKey((k) => k + 1);
            });
          }
          const confirmationId = confirmationIdOrSentinel as string;
          return fetch(`/api/nodes/${nodeId}/estimate-status`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              intent: "クイック切替",
              confirm_status: targetStatus,
              reason: "クイック切替",
              source: "human_ui",
              confirmation_id: confirmationId,
            }),
          })
            .then((res) => res.json())
            .then((json: { ok?: boolean; error?: string; valid_transitions?: Array<{ status: string; label: string }> }) => {
              if (requestId !== lastQuickSwitchRequestIdRef.current) return;
              if (!json.ok) throw json;
              return refreshDashboard();
            })
            .then((newTrays) => {
              if (requestId !== lastQuickSwitchRequestIdRef.current) return;
              setQuickSwitchInFlightNodeId(null);
              if (newTrays) {
                const latest = findNodeInTrays(newTrays, nodeId);
                if (latest) setSelected(latest);
                else setSelected(null);
                ensureParentInProgress(nodeId, newTrays, nodeChildren, selected?.parent_id ?? undefined);
              }
              setOptimisticStatusOverrides((prev) => {
                const next = { ...prev };
                delete next[nodeId];
                return next;
              });
              setStatusLogRefreshKey((k) => k + 1);
            });
        })
        .catch((err: unknown) => {
          if (requestId !== lastQuickSwitchRequestIdRef.current) return;
          setQuickSwitchInFlightNodeId(null);
          setOptimisticStatusOverrides((prev) => {
            const next = { ...prev };
            delete next[nodeId];
            return next;
          });
          const msg =
            err && typeof err === "object" && "error" in err && typeof (err as { error?: string }).error === "string"
              ? (err as { error: string; valid_transitions?: Array<{ status: string; label: string }> }).error
              : "状態の変更に失敗しました";
          const valid = err && typeof err === "object" && "valid_transitions" in err && Array.isArray((err as { valid_transitions?: unknown }).valid_transitions)
            ? (err as { valid_transitions: Array<{ label: string }> }).valid_transitions.map((t) => t.label).join("、")
            : "";
          setQuickSwitchError(valid ? `${msg}（遷移可能：${valid}）` : msg);
        });
    },
    [selected, displayStatus, refreshDashboard, ensureParentInProgress, nodeChildren]
  );

  /** タスクタイトル インライン編集: 保存（Enter / blur）。二重保存防止のため isSaving 中は blur 側でスキップする */
  const handleTitleSave = useCallback(
    (nodeId: string, value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      if (selected?.id === nodeId && (selected.title ?? "").trim() === trimmed) return;
      setError(null);
      setTitleSaveInFlight(true);
      fetch(`/api/nodes/${nodeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed, logChange: true }),
      })
        .then((res) => res.json())
        .then((json: { ok?: boolean; error?: string; unchanged?: boolean }) => {
          if (!json.ok) throw new Error(json.error ?? "保存に失敗しました");
          setTitleEditingNodeId(null);
          return refreshDashboard().then((newTrays) => ({ newTrays, unchanged: json.unchanged }));
        })
        .then(({ newTrays, unchanged }) => {
          if (newTrays && selected?.id === nodeId) {
            const latest = findNodeInTrays(newTrays, nodeId);
            if (latest) setSelected(latest);
          }
          setStatusLogRefreshKey((k) => k + 1);
          if (!unchanged) {
            setResultMessage("タイトルを更新しました");
            setTimeout(() => setResultMessage(null), 2500);
          }
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : "タイトルの保存に失敗しました");
        })
        .finally(() => {
          setTitleSaveInFlight(false);
        });
    },
    [selected, refreshDashboard]
  );

  /** タスクタイトル インライン編集: キャンセル（ESC） */
  const handleTitleCancel = useCallback(() => {
    setTitleEditingNodeId(null);
  }, []);

  /** 期日: 保存（日付選択 or 解除）。二重保存防止のため dueDateSaveInFlight 中はスキップ */
  const handleDueDateSave = useCallback(
    (nodeId: string, value: string | null) => {
      const current = selected?.id === nodeId ? (selected.due_date ?? null) : null;
      const currentNorm = current == null || current === "" ? null : String(current).slice(0, 10);
      const newNorm = value == null || value.trim() === "" ? null : value.trim().slice(0, 10);
      if (currentNorm === newNorm) return;
      setError(null);
      setDueDateSaveInFlight(true);
      fetch(`/api/nodes/${nodeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ due_date: newNorm, logChange: true }),
      })
        .then((res) => res.json())
        .then((json: { ok?: boolean; error?: string; unchanged?: boolean }) => {
          if (!json.ok) throw new Error(json.error ?? "保存に失敗しました");
          setDueDateEditingNodeId(null);
          return refreshDashboard().then((newTrays) => ({ newTrays, unchanged: json.unchanged }));
        })
        .then(({ newTrays, unchanged }) => {
          if (newTrays && selected?.id === nodeId) {
            const latest = findNodeInTrays(newTrays, nodeId);
            if (latest) setSelected(latest);
          }
          setStatusLogRefreshKey((k) => k + 1);
          if (!unchanged) {
            setResultMessage("期日を更新しました");
            setTimeout(() => setResultMessage(null), 2500);
          }
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : "期日の保存に失敗しました");
        })
        .finally(() => setDueDateSaveInFlight(false));
    },
    [selected, refreshDashboard]
  );

  const handleDueDateCancel = useCallback(() => {
    setDueDateEditingNodeId(null);
  }, []);

  // ─── Computed ───────────────────────────────────────────

  const visibleNodes = useMemo(() => {
    const base =
      !trays
        ? []
        : activeTrayKey === "all"
          ? [
              ...trays.in_progress,
              ...trays.needs_decision,
              ...trays.waiting_external,
              ...trays.cooling,
              ...trays.other_active,
            ]
          : trays[activeTrayKey];
    if (activeTrayKey === "all" || activeTrayKey === "other_active") {
      return [...optimisticNodes, ...base];
    }
    return base;
  }, [trays, activeTrayKey, optimisticNodes]);

  // Phase6-A: ツリー表示用ルート（node_children 優先・循環検知・深さ5まで）
  const treeRoots = useMemo(() => {
    if (viewMode !== "tree" || visibleNodes.length === 0) return [];
    return buildTree(
      visibleNodes as Array<Record<string, unknown> & { id: string; parent_id?: string | null }>,
      nodeChildren
    );
  }, [viewMode, visibleNodes, nodeChildren]);

  /** Phase9-A: treeRoots から ノード→親 マップ（履歴クリック時の展開用） */
  const parentById = useMemo(() => buildParentById(treeRoots), [treeRoots]);

  /** Phase9-A: 履歴 1 件クリック時のツリー連動（展開・ハイライト・詳細表示） */
  const handleHistoryItemSelect = useCallback(
    (payload: HistoryItemSelectPayload) => {
      setHighlightNodeIds(new Set(payload.nodeIds));
      if (viewMode === "tree" && treeRoots.length > 0) {
        setExpandedSet((prev) => {
          const next = new Set(prev);
          for (const nid of payload.nodeIds) {
            for (const aid of getAncestorIds(nid, parentById)) next.add(aid);
          }
          return next;
        });
      }
      const primaryNode = visibleNodes.find((n) => n.id === payload.primaryNodeId);
      if (primaryNode) setSelected(primaryNode);
    },
    [viewMode, treeRoots.length, parentById, visibleNodes]
  );

  /** Phase11-D: 大賢者アクション行クリック → 該当トレー展開＋最上位対象タスクにフォーカス */
  const handleSageActionClick = useCallback(
    (kind: string) => {
      if (!trays) return;
      let nodeId: string | null = null;
      let nextTray: keyof Trays | "all" = "all";
      if (kind === "needs_decision") {
        nextTray = "needs_decision";
        nodeId = trays.needs_decision[0]?.id ?? null;
      } else if (kind === "in_progress_stale") {
        nextTray = "in_progress";
        const staleThreshold = Date.now() - IN_PROGRESS_STALE_MINUTES * 60 * 1000;
        const first = trays.in_progress.find((n) => {
          const u = n.updated_at;
          if (!u) return true;
          try {
            return new Date(u).getTime() < staleThreshold;
          } catch {
            return true;
          }
        });
        nodeId = first?.id ?? null;
      } else if (kind === "ready") {
        nextTray = "other_active";
        const first = trays.other_active.find((n) => n.status === "READY");
        nodeId = first?.id ?? null;
      }
      setActiveTrayKey(nextTray);
      pendingSageFocusNodeIdRef.current = nodeId;
      try {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(
            SAGE_LAST_HANDLED_KEY,
            JSON.stringify({ kind, timestamp: Date.now() })
          );
        }
      } catch {
        // ignore
      }
    },
    [trays]
  );

  /** Phase11-D: トレー切替後にフォーカス対象ノードを選択・ツリー展開・ハイライト */
  useEffect(() => {
    const id = pendingSageFocusNodeIdRef.current;
    if (!id || visibleNodes.length === 0) return;
    const node = visibleNodes.find((n) => n.id === id);
    if (!node) return;
    pendingSageFocusNodeIdRef.current = null;
    setSelected(node as Node);
    setHighlightNodeIds(new Set([id]));
    if (viewMode === "tree" && treeRoots.length > 0) {
      const ancestorIds = getAncestorIds(id, parentById);
      setExpandedSet((prev) => new Set([...prev, ...ancestorIds]));
    }
  }, [visibleNodes, treeRoots, viewMode, parentById]);

  // Phase6-B: 開閉状態の復元（tree モード時のみ・初回のみ）
  useEffect(() => {
    if (!trays || viewMode !== "tree" || hasRestoredExpandedRef.current) return;
    const validIds = new Set(visibleNodes.map((n) => n.id));
    try {
      if (typeof localStorage === "undefined") return;
      const raw = localStorage.getItem(TREE_EXPANDED_STORAGE_KEY);
      if (!raw) {
        hasRestoredExpandedRef.current = true;
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        hasRestoredExpandedRef.current = true;
        return;
      }
      const filtered = parsed.filter((id): id is string => typeof id === "string" && validIds.has(id));
      setExpandedSet(new Set(filtered));
    } catch {
      // fail silently
    }
    hasRestoredExpandedRef.current = true;
  }, [trays, viewMode, visibleNodes]);

  // Phase6-B: 開閉状態の保存（tree モード時のみ・復元済み以降の変更の都度）
  // 復元前に保存しない＝初回マウントで空の [] が localStorage を上書きするのを防ぐ
  useEffect(() => {
    if (viewMode !== "tree" || !hasRestoredExpandedRef.current) return;
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(TREE_EXPANDED_STORAGE_KEY, JSON.stringify([...expandedSet]));
    } catch {
      // fail silently
    }
  }, [viewMode, expandedSet]);

  const counts = useMemo(() => {
    if (!trays) {
      return {
        in_progress: 0,
        needs_decision: 0,
        waiting_external: 0,
        cooling: 0,
        other_active: 0,
        total: 0,
      };
    }
    const c = {
      in_progress: trays.in_progress.length,
      needs_decision: trays.needs_decision.length,
      waiting_external: trays.waiting_external.length,
      cooling: trays.cooling.length,
      other_active: trays.other_active.length,
      total: 0,
    };
    c.total =
      c.in_progress +
      c.needs_decision +
      c.waiting_external +
      c.cooling +
      c.other_active;
    return c;
  }, [trays]);

  /** Phase11-D/11-E: 滞留検知時のみ表示。Phase11-E: 同 kind を直前に対応した場合は再表示しない（状態改善時のみ再出現許可） */
  const stagnationMessage = useMemo((): {
    kind: string;
    body: string;
    actionLine: string;
  } | null => {
    if (!trays) return null;
    const all: Node[] = [
      ...trays.in_progress,
      ...trays.needs_decision,
      ...trays.waiting_external,
      ...trays.cooling,
      ...trays.other_active,
    ];
    const readyCount = all.filter((n) => n.status === "READY").length;
    const needsDecisionCount = trays.needs_decision.length;
    const staleThreshold = Date.now() - IN_PROGRESS_STALE_MINUTES * 60 * 1000;
    const inProgressStaleCount = trays.in_progress.filter((n) => {
      const u = n.updated_at;
      if (!u) return true;
      try {
        return new Date(u).getTime() < staleThreshold;
      } catch {
        return true;
      }
    }).length;

    let candidate: { kind: string; body: string; actionLine: string } | null = null;
    if (needsDecisionCount >= NEEDS_DECISION_THRESHOLD) {
      candidate = {
        kind: "needs_decision",
        body:
          "マスター、判断待ちが 2 件以上あります。優先順位の確認を推奨します。滞留が長いと見落としの原因になります。",
        actionLine: "判断待ちのトレーで優先順位を確認する",
      };
    } else if (inProgressStaleCount >= 1) {
      candidate = {
        kind: "in_progress_stale",
        body:
          "マスター、実施中のタスクのうち、60 分以上更新がないものが 1 件以上あります。再開または状態の変更を推奨します。長期停滞は次の一手を決めづらくします。",
        actionLine: "実施中のトレーで該当タスクを選び、状態を更新する",
      };
    } else if (readyCount >= READY_THRESHOLD) {
      candidate = {
        kind: "ready",
        body:
          "マスター、着手可能なタスクが 3 件以上あります。どれから着手するか選ぶことを推奨します。未着手の蓄積は優先の判断材料になります。",
        actionLine: "着手可能なタスクから 1 件を選んで着手する",
      };
    }

    if (candidate === null) {
      try {
        if (typeof localStorage !== "undefined") localStorage.removeItem(SAGE_LAST_HANDLED_KEY);
      } catch {
        // ignore
      }
      return null;
    }
    try {
      if (typeof localStorage !== "undefined") {
        const raw = localStorage.getItem(SAGE_LAST_HANDLED_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as { kind?: string };
          if (parsed.kind === candidate.kind) return null;
        }
      }
    } catch {
      // ignore
    }
    return candidate;
  }, [trays]);

  // ─── Estimate flow ─────────────────────────────────────
  //
  // 09_API_Contract.md §7: estimate-status
  //   Preview:  intent → 推定候補（DB 副作用なし）
  //   Apply:    confirm_status → 遷移検証 → 適用 → history 記録
  //
  // 03_Non_Goals.md §2.2: 人は status を選ばない。
  //   「推定する」→ AI が候補提示 → 人が確認 or 「違う」と指摘

  const requestEstimate = async () => {
    if (!selected || !intentDraft.trim()) return;
    setEstimatePhase("loading");
    setResultMessage(null);
    setError(null);

    try {
      const res = await fetch(
        `/api/nodes/${selected.id}/estimate-status`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ intent: intentDraft.trim() }),
        }
      );
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "estimate failed");
      setEstimateResult(json as EstimatePreview);
      setEstimatePhase("preview");
      setShowCandidates(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "unknown error");
      setEstimatePhase("idle");
    }
  };

  const applyStatus = (targetStatus: string) => {
    if (!selected) return;
    const fromLabel = getStatusLabel(selected.status);
    const toLabel = getStatusLabel(targetStatus);
    setConfirmApply({ targetStatus, fromLabel, toLabel });
  };

  const doApplyStatus = async (targetStatus: string) => {
    if (!selected) return;
    const toLabel = getStatusLabel(targetStatus);
    setConfirmApply(null);
    setEstimatePhase("applying");
    setError(null);

    try {
      const confRes = await fetch("/api/confirmations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          node_id: selected.id,
          ui_action: "dashboard_apply_button",
          proposed_change: { type: "status_change", from: selected.status, to: targetStatus },
        }),
      });
      const confJson = await confRes.json();
      if (!confJson.ok) {
        if (confJson.current_status === targetStatus) {
          const newTrays = await refreshDashboard();
          const latestNode = findNodeInTrays(newTrays, selected.id);
          if (latestNode) setSelected(latestNode);
          else setSelected(null);
          setIntentDraft("");
          setEstimateResult(null);
          setEstimatePhase("idle");
          setShowCandidates(false);
          setResultMessage(`${toLabel} に変更しました（既にその状態でした）`);
          setStatusLogRefreshKey((k) => k + 1);
          return;
        }
        throw new Error(confJson.error || "confirmation failed");
      }
      const confirmationId = confJson.confirmation?.confirmation_id;
      if (!confirmationId) throw new Error("confirmation_id not returned");

      const res = await fetch(
        `/api/nodes/${selected.id}/estimate-status`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intent: intentDraft.trim(),
            confirm_status: targetStatus,
            reason: intentDraft.trim(),
            source: "human_ui",
            confirmation_id: confirmationId,
          }),
        }
      );
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "apply failed");

      setResultMessage(
        json.status_changed
          ? `${getStatusLabel(json.from_status)} → ${getStatusLabel(json.to_status)}に変更しました`
          : "メモを記録しました（状態は変更なし）"
      );

      const newTrays = await refreshDashboard();
      const latestNode = findNodeInTrays(newTrays, selected.id);
      if (latestNode) setSelected(latestNode);
      else setSelected(null);
      setIntentDraft("");
      setEstimateResult(null);
      setEstimatePhase("idle");
      setShowCandidates(false);
      setStatusLogRefreshKey((k) => k + 1);
      ensureParentInProgress(selected.id, newTrays, nodeChildren, selected?.parent_id ?? undefined);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "unknown error");
      setEstimatePhase("idle");
    }
  };

  // 確認モーダル表示中: Enter → OK、Escape → キャンセル
  useEffect(() => {
    if (!confirmApply) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        doApplyStatus(confirmApply.targetStatus);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setConfirmApply(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmApply]);

  // ─── Render ─────────────────────────────────────────────

  if (!mounted) {
    return (
      <div style={{ padding: 24, fontFamily: "sans-serif", background: "var(--bg-page)", color: "var(--text-primary)", minHeight: "100vh" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>
          状態が見えるダッシュボード
        </h1>
        <div style={{ color: "var(--text-secondary)", marginTop: 4 }}>
          「進行中の仕事」をトレーに分けて表示します
        </div>
        <div style={{ marginTop: 16 }}>読み込み中…</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", background: "var(--bg-page)", color: "var(--text-primary)", minHeight: "100vh" }}>
      {/* 「この状態にする」確認モーダル。Enter→OK / Escape→キャンセル */}
      {confirmApply && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-apply-title"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setConfirmApply(null);
            }
          }}
        >
          <div
            style={{
              background: "var(--bg-card)",
              color: "var(--text-primary)",
              padding: 20,
              borderRadius: 12,
              border: "1px solid var(--border-default)",
              maxWidth: 400,
              boxShadow: "0 4px 20px rgba(0,0,0,0.2)",
            }}
          >
            <div id="confirm-apply-title" style={{ fontWeight: 700, marginBottom: 12 }}>
              このタスクの状態を {confirmApply.fromLabel} → {confirmApply.toLabel} に変更します。よろしいですか？
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button
                type="button"
                onClick={() => setConfirmApply(null)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "1px solid var(--border-muted)",
                  background: "var(--bg-card)",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                }}
              >
                キャンセル
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => doApplyStatus(confirmApply.targetStatus)}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "1px solid var(--border-focus)",
                  background: "var(--color-info)",
                  color: "var(--text-on-primary)",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>
            状態が見えるダッシュボード
          </h1>
          <div style={{ color: "var(--text-secondary)", marginTop: 4 }}>
            「進行中の仕事」をトレーに分けて表示します
          </div>
        </div>
        <ThemeSwitcher />
      </div>

      {/* Phase12-B: 追加モード可視化。Phase14-QuickAdd: 1行input+送信ボタン。 */}
      {!loading && (
        <div style={{ marginTop: 12 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 6,
              color: "var(--text-secondary)",
              fontSize: 12,
            }}
          >
            {selected ? (
              <>
                <span>子タスクとして追加します：{getNodeTitle(selected)}</span>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: "1px solid var(--border-default)",
                    background: "var(--bg-card)",
                    color: "var(--text-primary)",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  親なしで追加
                </button>
              </>
            ) : (
              <span>新しい仕事として追加します</span>
            )}
          </div>
          <QuickAdd
            value={quickAddValue}
            onChange={setQuickAddValue}
            onSubmit={handleQuickAddSubmit}
            onClear={() => setQuickAddValue("")}
            inputRef={quickAddInputRef}
            buttonDisabled={quickAddSending}
          />
        </div>
      )}

      {/* Loading */}
      {loading && <div style={{ marginTop: 16 }}>読み込み中…</div>}

      {/* Error banner */}
      {error && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            border: "1px solid var(--border-danger)",
            borderRadius: 8,
            background: "var(--bg-danger)",
          }}
        >
          <div style={{ fontWeight: 700 }}>エラー</div>
          <div style={{ color: "var(--text-danger)" }}>{error}</div>
        </div>
      )}

      {/* Phase11-D: 大賢者の助言（滞留検知時のみ・アイコン＋見出し＋本文＋推奨アクション） */}
      {!loading && trays && stagnationMessage && (
        <div
          style={{
            marginTop: 16,
            padding: "14px 16px",
            border: "1px solid var(--border-sage)",
            borderLeft: "4px solid var(--border-sage)",
            borderRadius: 8,
            background: "var(--bg-sage)",
            color: "var(--text-sage)",
            fontSize: 13,
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span style={{ fontSize: 18, lineHeight: 1.2, color: "var(--text-sage)" }} aria-hidden>◆</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, color: "var(--text-sage)" }}>
                大賢者の助言
              </div>
              <div style={{ lineHeight: 1.6, marginBottom: 8 }}>
                {stagnationMessage.body}
              </div>
              <button
                type="button"
                onClick={() => handleSageActionClick(stagnationMessage.kind)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  fontSize: 12,
                  color: "var(--text-sage)",
                  fontWeight: 600,
                  paddingTop: 6,
                  marginTop: 6,
                  borderTop: "1px solid var(--border-subtle)",
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                }}
              >
                → {stagnationMessage.actionLine}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tray summary cards */}
      {!loading && trays && (
        <div
          style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}
        >
          <SummaryCard
            title={TRAY_LABEL.all}
            value={counts.total}
            onClick={() => setActiveTrayKey("all")}
            active={activeTrayKey === "all"}
          />
          <SummaryCard
            title={TRAY_LABEL.in_progress}
            value={counts.in_progress}
            onClick={() => setActiveTrayKey("in_progress")}
            active={activeTrayKey === "in_progress"}
          />
          <SummaryCard
            title={TRAY_LABEL.needs_decision}
            value={counts.needs_decision}
            onClick={() => setActiveTrayKey("needs_decision")}
            active={activeTrayKey === "needs_decision"}
          />
          <SummaryCard
            title={TRAY_LABEL.waiting_external}
            value={counts.waiting_external}
            onClick={() => setActiveTrayKey("waiting_external")}
            active={activeTrayKey === "waiting_external"}
          />
          <SummaryCard
            title={TRAY_LABEL.cooling}
            value={counts.cooling}
            onClick={() => setActiveTrayKey("cooling")}
            active={activeTrayKey === "cooling"}
          />
          <SummaryCard
            title={TRAY_LABEL.other_active}
            value={counts.other_active}
            onClick={() => setActiveTrayKey("other_active")}
            active={activeTrayKey === "other_active"}
          />
        </div>
      )}

      {/* Main: list + detail */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 420px",
          gap: 16,
          marginTop: 16,
        }}
      >
        {/* ─── Left: Node list ────────────────────────── */}
        <div
          style={{
            border: "1px solid var(--border-default)",
            borderRadius: 10,
            overflow: "hidden",
            background: "var(--bg-panel)",
          }}
        >
          <div
            style={{
              padding: 12,
              borderBottom: "1px solid var(--border-subtle)",
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <span>一覧：{TRAY_LABEL[activeTrayKey]}</span>
            <span style={{ fontSize: 12, fontWeight: 500 }}>
              <button
                type="button"
                onClick={() => setViewMode("flat")}
                style={{
                  padding: "4px 8px",
                  marginRight: 4,
                  border: viewMode === "flat" ? "2px solid var(--border-focus)" : "1px solid var(--border-default)",
                  borderRadius: 6,
                  background: viewMode === "flat" ? "var(--bg-selected)" : "var(--bg-card)",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                フラット
              </button>
              <button
                type="button"
                onClick={() => setViewMode("tree")}
                style={{
                  padding: "4px 8px",
                  border: viewMode === "tree" ? "2px solid var(--border-focus)" : "1px solid var(--border-default)",
                  borderRadius: 6,
                  background: viewMode === "tree" ? "var(--bg-selected)" : "var(--bg-card)",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                ツリー
              </button>
            </span>
          </div>

          {visibleNodes.length === 0 ? (
            <div style={{ padding: 12, color: "var(--text-secondary)" }}>
              対象のタスクがありません
            </div>
          ) : viewMode === "tree" ? (
            <TreeList
              roots={treeRoots}
              expandedSet={expandedSet}
              onToggleExpand={(nodeId) => {
                setExpandedSet((prev) => {
                  const next = new Set(prev);
                  if (next.has(nodeId)) next.delete(nodeId);
                  else next.add(nodeId);
                  return next;
                });
              }}
              onExpand={(nodeId) => {
                setExpandedSet((prev) => new Set([...prev, nodeId]));
              }}
              onCollapse={(nodeId) => {
                setExpandedSet((prev) => {
                  const next = new Set(prev);
                  next.delete(nodeId);
                  return next;
                });
              }}
              onCollapseIds={(ids) => {
                setExpandedSet((prev) => {
                  const next = new Set(prev);
                  ids.forEach((id) => next.delete(id));
                  return next;
                });
              }}
              onSelectNode={(node) => {
                setHighlightNodeIds(null);
                setSelected(node as Node);
              }}
              selectedId={selected?.id ?? null}
              getNodeTitle={(n) => getNodeTitle(n as Node)}
              getNodeSubtext={(n) => getNodeSubtext(n as Node)}
              getStatusLabel={(n) => getStatusLabel(optimisticStatusOverrides[(n as Node).id] ?? (n as { status?: string }).status ?? "")}
              highlightIds={highlightNodeIds}
              onTreeMove={
                activeTrayKey === "all"
                  ? async (movedNodeId, newParentId, orderedSiblingIds) => {
                      const res = await fetch("/api/tree/move", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ movedNodeId, newParentId, orderedSiblingIds }),
                      });
                      const json = await res.json();
                      if (!json.ok) {
                        setError(json.error ?? "ツリーの移動に失敗しました");
                        return;
                      }
                      await refreshDashboard();
                    }
                  : undefined
              }
            />
          ) : (
            visibleNodes.map((n) => {
              const title = getNodeTitle(n);
              const subtext = getNodeSubtext(n);
              const isSelected = selected?.id === n.id;
              const isHighlighted = highlightNodeIds?.has(n.id) ?? false;
              return (
                <div
                  key={n.id}
                  onClick={() => {
                    setHighlightNodeIds(null);
                    setSelected(n);
                  }}
                  style={{
                    padding: 12,
                    borderTop: "1px solid var(--border-subtle)",
                    cursor: "pointer",
                    background: isHighlighted ? "var(--bg-highlight)" : isSelected ? "var(--bg-selected)" : "var(--bg-card)",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {title}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--text-secondary)",
                        marginTop: 2,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {subtext || "（途中内容なし）"}
                    </div>
                  </div>
                  <div
                    style={{ fontSize: 12, color: "var(--text-primary)", whiteSpace: "nowrap" }}
                  >
                    {getStatusLabel(optimisticStatusOverrides[n.id] ?? n.status)}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ─── Right: Detail + Estimate flow ──────────── */}
        <div style={{ border: "1px solid var(--border-default)", borderRadius: 10, padding: 12, background: "var(--bg-panel)" }}>
          <div style={{ fontWeight: 800 }}>詳細</div>

          {!selected ? (
            <div style={{ marginTop: 8, color: "var(--text-secondary)" }}>
              左の一覧からタスクをクリックしてください
            </div>
          ) : (
            <div style={{ marginTop: 10 }}>
              {/* Node info: タイトル + インライン編集（ペン → input） */}
              <div style={{ fontWeight: 800, fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
                {titleEditingNodeId === selected.id ? (
                  <input
                    ref={titleInputRef}
                    type="text"
                    defaultValue={selected.title ?? ""}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleTitleSave(selected.id, (e.target as HTMLInputElement).value);
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        handleTitleCancel();
                      }
                    }}
                    onBlur={(e) => {
                      if (titleSaveInFlight) return;
                      const v = (e.target as HTMLInputElement).value.trim();
                      if (v) handleTitleSave(selected.id, v);
                      else handleTitleCancel();
                    }}
                    style={{
                      flex: 1,
                      fontSize: 16,
                      fontWeight: 800,
                      padding: "4px 8px",
                      border: "1px solid var(--border-focus)",
                      borderRadius: 4,
                      background: "var(--bg-card)",
                      color: "var(--text-primary)",
                    }}
                    data-testid="detail-title-input"
                  />
                ) : (
                  <>
                    <span>{getNodeTitle(selected)}</span>
                    <button
                      type="button"
                      onClick={() => setTitleEditingNodeId(selected.id)}
                      style={{
                        padding: 4,
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        color: "var(--text-muted)",
                        fontSize: 14,
                      }}
                      title="タイトルを編集"
                      aria-label="タイトルを編集"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                  </>
                )}
              </div>

              {/* 期日: 表示 or 編集（date input）・解除 */}
              <div style={{ marginTop: 8, fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
                <b>期日：</b>
                {dueDateEditingNodeId === selected.id ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                    <input
                      ref={dueDateInputRef}
                      type="date"
                      defaultValue={selected.due_date ?? ""}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          e.preventDefault();
                          handleDueDateCancel();
                        }
                      }}
                      onChange={(e) => {
                        if (dueDateSaveInFlight) return;
                        const v = (e.target as HTMLInputElement).value.trim();
                        if (v) handleDueDateSave(selected.id, v);
                      }}
                      onBlur={(e) => {
                        if (dueDateSaveInFlight) return;
                        const v = (e.target as HTMLInputElement).value.trim();
                        if (v) handleDueDateSave(selected.id, v);
                        else handleDueDateCancel();
                      }}
                      style={{
                        padding: "4px 8px",
                        border: "1px solid var(--border-focus)",
                        borderRadius: 4,
                        background: "var(--bg-card)",
                        color: "var(--text-primary)",
                      }}
                      data-testid="detail-due-date-input"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (dueDateSaveInFlight) return;
                        handleDueDateSave(selected.id, null);
                      }}
                      style={{
                        padding: "4px 8px",
                        fontSize: 12,
                        border: "1px solid var(--border-default)",
                        borderRadius: 4,
                        background: "var(--bg-card)",
                        color: "var(--text-secondary)",
                        cursor: "pointer",
                      }}
                    >
                      解除
                    </button>
                  </div>
                ) : (
                  <>
                    <span>{formatDueDateDisplay(selected.due_date)}</span>
                    <button
                      type="button"
                      onClick={() => setDueDateEditingNodeId(selected.id)}
                      style={{
                        padding: 4,
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        color: "var(--text-muted)",
                        fontSize: 14,
                      }}
                      title="期日を編集"
                      aria-label="期日を編集"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                    {selected.due_date ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (dueDateSaveInFlight) return;
                          handleDueDateSave(selected.id, null);
                        }}
                        style={{
                          padding: 2,
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          color: "var(--text-muted)",
                          fontSize: 14,
                        }}
                        title="期日を解除"
                        aria-label="期日を解除"
                      >
                        ×
                      </button>
                    ) : null}
                  </>
                )}
              </div>

              <div style={{ marginTop: 8, fontSize: 13 }}>
                <div>
                  <b>状態：</b> <StatusBadge status={displayStatus(selected)} />
                </div>
                <StatusQuickSwitch
                  currentStatus={displayStatus(selected)}
                  validTransitions={getValidTransitions(displayStatus(selected) as import("@/lib/stateMachine").Status)}
                  buttonsDisabled={quickSwitchInFlightNodeId === selected.id}
                  onStatusClick={handleQuickSwitchClick}
                />
                {quickSwitchError && (
                  <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-danger)" }}>
                    {quickSwitchError}
                  </div>
                )}
                {selected.temperature != null && (
                  <div style={{ marginTop: 4 }}>
                    <b>温度：</b> {selected.temperature}
                    <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 4 }}>
                      （参考値）
                    </span>
                  </div>
                )}
                {(selected.last_memo ?? selected.context) && (
                  <div style={{ marginTop: 4 }}>
                    <b>途中内容：</b>
                    <span style={{ color: "var(--text-primary)" }}>
                      {selected.last_memo ?? selected.context ?? ""}
                    </span>
                  </div>
                )}
                <div style={{ marginTop: 4 }} suppressHydrationWarning>
                  <b>最終更新：</b>{" "}
                  {formatLastUpdated(selected.last_memo_at ?? selected.updated_at)}
                </div>
              </div>

              {/* Phase10-A: 関連する直近履歴 1 件（102 設計） */}
              <div
                style={{
                  marginTop: 12,
                  paddingTop: 12,
                  borderTop: "1px solid var(--border-subtle)",
                  fontSize: 12,
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                  関連する直近履歴
                </div>
                {relatedRecentHistoryLoading && (
                  <div style={{ color: "var(--text-secondary)" }}>取得中…</div>
                )}
                {!relatedRecentHistoryLoading && relatedRecentHistoryError && (
                  <div style={{ color: "var(--text-danger)" }}>{relatedRecentHistoryError}</div>
                )}
                {!relatedRecentHistoryLoading && !relatedRecentHistoryError && relatedRecentHistory == null && (
                  <div style={{ color: "var(--text-secondary)" }}>該当する履歴はありません</div>
                )}
                {!relatedRecentHistoryLoading && !relatedRecentHistoryError && relatedRecentHistory && (() => {
                  const pc = relatedRecentHistory.proposed_change ?? {};
                  const dateStr = (relatedRecentHistory.consumed_at || relatedRecentHistory.confirmed_at || "").slice(0, 19).replace("T", " ");
                  const typeLabel = getRelatedHistoryTypeLabel(pc);
                  const summary = getRelatedHistorySummary(pc);
                  const reason = pc.reason != null && String(pc.reason).trim() !== "" ? String(pc.reason) : null;
                  return (
                    <div style={{ color: "var(--text-primary)" }}>
                      <div><b>{typeLabel}</b> {dateStr}</div>
                      <div style={{ marginTop: 4 }}>{summary}</div>
                      {reason != null && (
                        <div style={{ marginTop: 4, fontSize: 11, color: "var(--text-muted)" }}>理由: {reason}</div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Result message (after apply) */}
              {resultMessage && (
                <div
                  style={{
                    marginTop: 12,
                    padding: 8,
                    borderRadius: 6,
                    background: "var(--bg-success)",
                    color: "var(--text-success)",
                    fontSize: 13,
                  }}
                >
                  {resultMessage}
                </div>
              )}

              {/* ─── Intent input ─────────────────────── */}
              {/* 03_Non_Goals.md §2.2: status を人に選ばせない  */}
              {/* → 「何が起きたか」を自然言語で入力させる       */}
              <div
                style={{
                  marginTop: 14,
                  paddingTop: 12,
                  borderTop: "1px solid var(--border-subtle)",
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: 8 }}>
                  何が起きた？
                </div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>
                  状態の推定に使います。メモとしても履歴に残ります。
                </div>
                <textarea
                  value={intentDraft}
                  onChange={(e) => setIntentDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (intentDraft.trim() && estimatePhase === "idle") requestEstimate();
                    }
                  }}
                  rows={3}
                  style={{
                    width: "100%",
                    padding: 10,
                    borderRadius: 8,
                    border: "1px solid var(--border-muted)",
                    boxSizing: "border-box",
                    background: "var(--bg-card)",
                    color: "var(--text-primary)",
                  }}
                  disabled={
                    estimatePhase === "loading" ||
                    estimatePhase === "applying"
                  }
                  placeholder="例：「返信待ちになった」「もう完了した」「判断に迷っている」（Enterで推定 / Shift+Enterで改行）"
                />
                <button
                  onClick={requestEstimate}
                  disabled={
                    !intentDraft.trim() ||
                    estimatePhase === "loading" ||
                    estimatePhase === "applying"
                  }
                  style={{
                    marginTop: 8,
                    padding: "8px 16px",
                    borderRadius: 8,
                    border: "1px solid var(--border-muted)",
                    fontWeight: 700,
                    background:
                      estimatePhase === "loading" ? "var(--bg-disabled)" : "var(--bg-card)",
                    color: "var(--text-primary)",
                    cursor:
                      !intentDraft.trim() || estimatePhase !== "idle"
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  {estimatePhase === "loading" ? "推定中…" : "推定する"}
                </button>
              </div>

              {/* ステータス・メモログ（一番上が最新） */}
              <div
                style={{
                  marginTop: 14,
                  paddingTop: 12,
                  borderTop: "1px solid var(--border-subtle)",
                  fontSize: 12,
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                  ステータス・メモログ
                </div>
                {statusLogLoading && (
                  <div style={{ color: "var(--text-secondary)" }}>取得中…</div>
                )}
                {!statusLogLoading && statusLogError && (
                  <div style={{ color: "var(--text-danger)" }}>{statusLogError}</div>
                )}
                {!statusLogLoading && !statusLogError && statusLog.length === 0 && (
                  <div style={{ color: "var(--text-secondary)" }}>まだ履歴はありません</div>
                )}
                {!statusLogLoading && !statusLogError && statusLog.length > 0 && (
                  <ul style={{ margin: 0, paddingLeft: 18, listStyle: "disc" }}>
                    {statusLog.map((entry, i) => {
                      const isStatusChange = entry.from_status !== entry.to_status;
                      const isTitleChange = typeof entry.reason === "string" && entry.reason.startsWith("タイトル変更:");
                      const isDueDateChange = typeof entry.reason === "string" && entry.reason.startsWith("期日変更:");
                      const timeStr = formatLastUpdated(entry.consumed_at);
                      const label = isTitleChange
                        ? "タイトル変更"
                        : isDueDateChange
                          ? "期日変更"
                          : isStatusChange
                            ? `ステータス更新: ${getStatusLabel(entry.from_status)} → ${getStatusLabel(entry.to_status)}`
                            : "メモ";
                      const reasonTrim = typeof entry.reason === "string" ? entry.reason.trim() : "";
                      return (
                        <li key={i} style={{ marginTop: 6 }}>
                          <span style={{ color: "var(--text-muted)" }}>{timeStr}</span>
                          <div style={{ marginTop: 2, color: "var(--text-primary)" }}>
                            {label}
                            {reasonTrim && (
                              <span style={{ marginLeft: 6, color: "var(--text-secondary)" }}>
                                {reasonTrim}
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* ─── Estimate results ─────────────────── */}
              {estimatePhase === "preview" && estimateResult && (
                <div
                  style={{
                    marginTop: 14,
                    paddingTop: 12,
                    borderTop: "1px solid var(--border-subtle)",
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: 8 }}>
                    推定結果
                  </div>

                  {estimateResult.suggested ? (
                    /* ── AI が候補を推定できた場合 ── */
                    <div>
                      <div style={{ fontSize: 14 }}>
                        →{" "}
                        <StatusBadge
                          status={estimateResult.suggested.status}
                        />
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--text-secondary)",
                          marginTop: 4,
                        }}
                      >
                        {estimateResult.suggested.reason}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          marginTop: 10,
                          flexWrap: "wrap",
                        }}
                      >
                        <button
                          onClick={() =>
                            applyStatus(estimateResult.suggested!.status)
                          }
                          style={{
                            padding: "8px 14px",
                            borderRadius: 8,
                            border: "1px solid var(--border-focus)",
                            background: "var(--color-info)",
                            color: "var(--text-on-primary)",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          この状態にする
                        </button>
                        <button
                          onClick={() => setShowCandidates(!showCandidates)}
                          style={{
                            padding: "8px 14px",
                            borderRadius: 8,
                            border: "1px solid var(--border-muted)",
                            background: "var(--bg-card)",
                            color: "var(--text-primary)",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          {showCandidates ? "候補を閉じる" : "違う…"}
                        </button>
                        <button
                          onClick={() =>
                            applyStatus(estimateResult.current_status)
                          }
                          style={{
                            padding: "8px 14px",
                            borderRadius: 8,
                            border: "1px solid var(--border-muted)",
                            background: "var(--bg-card)",
                            fontWeight: 700,
                            cursor: "pointer",
                            color: "var(--text-secondary)",
                          }}
                        >
                          メモだけ残す
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ── キーワードから推定できなかった場合 ── */
                    <div>
                      <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                        キーワードから状態を推定できませんでした。
                        <br />
                        以下から選ぶか、メモだけ残せます。
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: 6,
                          flexWrap: "wrap",
                          marginTop: 8,
                        }}
                      >
                        {estimateResult.candidates.map((c) => (
                          <button
                            key={c.status}
                            onClick={() => applyStatus(c.status)}
                            style={{
                              padding: "4px 10px",
                              borderRadius: 6,
                              border: "1px solid var(--border-default)",
                              background: "var(--bg-card)",
                              color: "var(--text-primary)",
                              fontSize: 12,
                              cursor: "pointer",
                            }}
                          >
                            {c.label}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() =>
                          applyStatus(estimateResult.current_status)
                        }
                        style={{
                          marginTop: 8,
                          padding: "8px 14px",
                          borderRadius: 8,
                          border: "1px solid var(--border-muted)",
                          background: "var(--bg-card)",
                          fontWeight: 700,
                          cursor: "pointer",
                          color: "var(--text-secondary)",
                        }}
                      >
                        メモだけ残す
                      </button>
                    </div>
                  )}

                  {/* ── 「違う…」で展開される候補一覧 ── */}
                  {/* 00_Vision §5.4: 人は「違う」と指摘できる */}
                  {showCandidates && estimateResult.suggested && (
                    <div
                      style={{
                        marginTop: 10,
                        paddingTop: 10,
                        borderTop: "1px solid var(--border-subtle)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--text-secondary)",
                          marginBottom: 6,
                        }}
                      >
                        他の遷移先を選ぶ：
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: 6,
                          flexWrap: "wrap",
                        }}
                      >
                        {estimateResult.candidates
                          .filter(
                            (c) =>
                              c.status !== estimateResult.suggested?.status
                          )
                          .map((c) => (
                            <button
                              key={c.status}
                              onClick={() => applyStatus(c.status)}
                              style={{
                                padding: "4px 10px",
                                borderRadius: 6,
                                border: "1px solid var(--border-default)",
                                background: "var(--bg-card)",
                                color: "var(--text-primary)",
                                fontSize: 12,
                                cursor: "pointer",
                              }}
                            >
                              {c.label}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Applying indicator */}
              {estimatePhase === "applying" && (
                <div style={{ marginTop: 10, color: "var(--text-secondary)" }}>反映中…</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── Observer 提案パネル（Phase 3-0〜3-4）──────────── */}
      {/* 表示条件: (1) 取得失敗 → observerError (2) report が null → レポートなし (3) あり → 最新 1 件を表示 */}
      {/* 必ず表示: created_at（ローカル）, source, rule_version, node_count, 取得失敗時のメッセージ */}
      {!loading && (
        <div
          style={{
            marginTop: 24,
            border: "1px solid var(--border-default)",
            borderRadius: 10,
            padding: 16,
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 16 }}>
            観測結果の提案
          </div>

          {/* メタ情報: created_at（ローカル）, source, node_count, rule_version — report があるとき表示 */}
          {observerReport && (
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                color: "var(--text-secondary)",
                display: "flex",
                flexWrap: "wrap",
                gap: "12px 16px",
              }}
            >
              <span suppressHydrationWarning>
                <b>取得日時:</b>{" "}
                {(() => {
                  const raw = (observerReport as Record<string, unknown>).created_at as string | undefined;
                  if (!raw) return "—";
                  try {
                    return new Date(raw).toLocaleString();
                  } catch {
                    return raw;
                  }
                })()}
              </span>
              <span>
                <b>取得元:</b>{" "}
                {((observerReport as Record<string, unknown>).source as string) ?? "—"}
              </span>
              <span>
                <b>タスク数:</b>{" "}
                {String((observerReport as Record<string, unknown>).node_count ?? "—")}
              </span>
              <span>
                <b>ルール版:</b>{" "}
                {(() => {
                  const payload = (observerReport as Record<string, unknown>).payload as Record<string, unknown> | undefined;
                  const debug = payload?.suggested_next && typeof payload.suggested_next === "object" && (payload.suggested_next as Record<string, unknown>).debug;
                  const ver = debug && typeof debug === "object" && (debug as Record<string, unknown>).rule_version;
                  return ver != null ? String(ver) : "—";
                })()}
              </span>
              {/* 31: 鮮度 — observed_at から経過時間を表示 */}
              {(() => {
                const payload = (observerReport as Record<string, unknown>).payload as Record<string, unknown> | undefined;
                const meta = payload?.meta && typeof payload.meta === "object" ? (payload.meta as Record<string, unknown>) : undefined;
                const observedAtRaw = (meta?.observed_at as string) ?? (observerReport as Record<string, unknown>).created_at as string | undefined;
                if (!observedAtRaw) return <span><b>最終観測:</b> —</span>;
                try {
                  const observedAt = new Date(observedAtRaw).getTime();
                  const now = Date.now();
                  const minutes = Math.floor((now - observedAt) / 60_000);
                  let label: string;
                  if (minutes < 1) label = "たった今";
                  else if (minutes < 60) label = `${minutes}分前`;
                  else if (minutes < 24 * 60) label = `${Math.floor(minutes / 60)}時間前`;
                  else label = `${Math.floor(minutes / (24 * 60))}日以上前`;
                  return (
                    <span>
                      <b>最終観測:</b> {label}
                    </span>
                  );
                } catch {
                  return <span><b>最終観測:</b> —</span>;
                }
              })()}
              {/* 31: 60分以上で「少し古い提案です」を薄く表示（warnings とは別） */}
              {observerReport && (() => {
                const payload = (observerReport as Record<string, unknown>).payload as Record<string, unknown> | undefined;
                const meta = payload?.meta && typeof payload.meta === "object" ? (payload.meta as Record<string, unknown>) : undefined;
                const observedAtRaw = (meta?.observed_at as string) ?? (observerReport as Record<string, unknown>).created_at as string | undefined;
                if (!observedAtRaw) return null;
                try {
                  const observedAt = new Date(observedAtRaw).getTime();
                  const minutes = Math.floor((Date.now() - observedAt) / 60_000);
                  if (minutes < 60) return null;
                  return (
                    <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
                      ⚠ 少し古い提案です
                    </span>
                  );
                } catch {
                  return null;
                }
              })()}
            </div>
          )}

          {/* Phase 3-4.5: payload.warnings が 1 件以上 → ⚠ 注意ブロック（29_Observer_Warnings.md） */}
          {!observerLoading && observerReport && (() => {
            const payload = (observerReport as Record<string, unknown>).payload as Record<string, unknown> | undefined;
            const warnings = Array.isArray(payload?.warnings) ? payload.warnings as Array<Record<string, unknown>> : [];
            if (warnings.length === 0) return null;
            return (
              <div
                style={{
                  marginTop: 8,
                  padding: 12,
                  border: "1px solid var(--border-warning)",
                  borderRadius: 8,
                  background: "var(--bg-warning)",
                  fontSize: 13,
                }}
              >
                <div style={{ fontWeight: 800, color: "var(--text-warning)", marginBottom: 8 }}>
                  ⚠ 異常を検知しました（{warnings.length}件）
                </div>
                {warnings.map((w, i) => (
                  <div
                    key={i}
                    style={{
                      marginTop: i > 0 ? 10 : 0,
                      padding: 8,
                      background: "var(--bg-warning-strong)",
                      borderRadius: 6,
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>
                      {String(w.code ?? "UNKNOWN")}
                    </div>
                    <div style={{ marginTop: 4, color: "var(--text-primary)" }}>
                      {String(w.message ?? "")}
                    </div>
                    {w.details != null && (
                      <div style={{ marginTop: 6 }}>
                        <button
                          type="button"
                          onClick={() => setObserverWarningExpanded(observerWarningExpanded === i ? null : i)}
                          style={{
                            fontSize: 12,
                            padding: "4px 8px",
                            border: "1px solid var(--border-warning)",
                            borderRadius: 4,
                            background: "var(--bg-card)",
                            cursor: "pointer",
                          }}
                        >
                          {observerWarningExpanded === i ? "詳細を閉じる" : "詳細を見る"}
                        </button>
                        {observerWarningExpanded === i && (
                          <pre
                            style={{
                              marginTop: 6,
                              padding: 8,
                              background: "var(--bg-code)",
                              borderRadius: 4,
                              fontSize: 11,
                              overflow: "auto",
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-all",
                            }}
                          >
                            {JSON.stringify(w.details, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}

          {observerLoading && (
            <div style={{ marginTop: 8, color: "var(--text-secondary)" }}>読み込み中…</div>
          )}

          {/* 取得失敗時: 1 行でメッセージを表示 */}
          {!observerLoading && observerError && (
            <div
              style={{
                marginTop: 8,
                padding: 10,
                border: "1px solid var(--border-danger)",
                borderRadius: 6,
                background: "var(--bg-danger)",
                color: "var(--text-danger)",
                fontSize: 13,
              }}
            >
              {observerError}
            </div>
          )}

          {/* report が null のとき（API が ok: true, report: null を返した場合） */}
          {!observerLoading && !observerError && !observerReport && (
            <div style={{ marginTop: 8, color: "var(--text-secondary)" }}>
              観測結果がまだありません。Actions で Observer Cron を実行するか、ローカルで python main.py --save を実行してください。
            </div>
          )}

          {/* report あり: payload を表示 */}
          {!observerLoading && observerReport && (() => {
            const payload = (observerReport as Record<string, unknown>)
              .payload as Record<string, unknown> | null | undefined;
            if (!payload) {
              return (
                <div style={{ marginTop: 8, color: "var(--text-secondary)", fontSize: 13 }}>
                  レポート内容がありません。
                </div>
              );
            }

            const suggestedNext = payload.suggested_next as Record<
              string,
              unknown
            > | null;
            const statusProposals = (payload.status_proposals ?? []) as Record<
              string,
              unknown
            >[];
            const coolingAlerts = (payload.cooling_alerts ?? []) as Record<
              string,
              unknown
            >[];
            const summary = (payload.summary ?? "") as string;

            return (
              <div style={{ marginTop: 12 }}>
                {/* Summary */}
                {summary && (
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--text-primary)",
                      padding: 8,
                      background: "var(--bg-muted)",
                      borderRadius: 6,
                    }}
                  >
                    {summary}
                  </div>
                )}

                {/* Suggested Next */}
                {suggestedNext && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: 10,
                      border: "1px solid var(--border-focus)",
                      borderRadius: 8,
                      background: "var(--bg-selected)",
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13 }}>
                      今やるとよさそうなこと
                    </div>
                    <div style={{ fontWeight: 800, marginTop: 4 }}>
                      {suggestedNext.title as string}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                      {suggestedNext.reason as string}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text-primary)", marginTop: 4 }}>
                      → {suggestedNext.next_action as string}
                    </div>
                  </div>
                )}

                {/* Status Proposals */}
                {statusProposals.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                      状態変更の提案
                    </div>
                    {statusProposals.map((p, i) => (
                      <div
                        key={i}
                        style={{
                          padding: 8,
                          border: "1px solid var(--border-subtle)",
                          borderRadius: 6,
                          marginBottom: 4,
                          fontSize: 13,
                        }}
                      >
                        <b>{p.title as string}</b>
                        <span style={{ color: "var(--text-secondary)", marginLeft: 8 }}>
                          {p.current_status as string} →{" "}
                          {p.suggested_status as string}
                        </span>
                        <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                          {p.reason as string}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Cooling Alerts */}
                {coolingAlerts.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                      冷却確認
                    </div>
                    {coolingAlerts.map((a, i) => (
                      <div
                        key={i}
                        style={{
                          padding: 8,
                          border: "1px solid var(--border-warning)",
                          borderRadius: 6,
                          background: "var(--bg-warning)",
                          marginBottom: 4,
                          fontSize: 13,
                        }}
                      >
                        {a.message as string}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* ─── 提案パネル（Phase 4）──────────────────────────────── */}
      {!loading && (
        <ProposalPanel
          trays={trays ?? null}
          selectedNodeId={selected?.id ?? null}
          onRefreshDashboard={refreshDashboard}
          onHistoryItemSelect={handleHistoryItemSelect}
        />
      )}
    </div>
  );
}
