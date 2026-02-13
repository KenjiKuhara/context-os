"use client";

/**
 * Dashboard — 「机の上（アクティブ）」を一望するページ
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
import { STATUS_LABELS } from "@/lib/stateMachine";
import { ProposalPanel } from "@/components/ProposalPanel";
import { TreeList } from "@/components/TreeList";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
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
  all: "全て（机の上）",
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

function getStatusLabel(status: string): string {
  return (STATUS_LABELS as Record<string, string>)[status] ?? status;
}

function getNodeSubtext(n: Node): string {
  // 04_Domain_Model: context が第一級。note はフォールバック。
  return n.context ?? n.note ?? "";
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
        border: active ? "2px solid #5567ff" : "1px solid #ddd",
        borderRadius: 10,
        padding: 12,
        minWidth: 150,
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <div style={{ fontSize: 12, color: "#666" }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 900 }}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 6,
        background: "#f0f0f0",
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

  // ─── Data fetch ─────────────────────────────────────────

  const refreshDashboard = useCallback(async () => {
    const res = await fetch("/api/dashboard", { cache: "no-store" });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "API error");
    setTrays(json.trays as Trays);
    setNodeChildren(Array.isArray(json.node_children) ? json.node_children : []);
    return json.trays as Trays;
  }, []);

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

  // ─── Computed ───────────────────────────────────────────

  const visibleNodes = useMemo(() => {
    if (!trays) return [];
    if (activeTrayKey === "all") {
      return [
        ...trays.in_progress,
        ...trays.needs_decision,
        ...trays.waiting_external,
        ...trays.cooling,
        ...trays.other_active,
      ];
    }
    return trays[activeTrayKey];
  }, [trays, activeTrayKey]);

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

  const applyStatus = async (targetStatus: string) => {
    if (!selected) return;
    const fromLabel = getStatusLabel(selected.status);
    const toLabel = getStatusLabel(targetStatus);
    if (!window.confirm(`このタスクの状態を ${fromLabel} → ${toLabel} に変更します。よろしいですか？`)) {
      return;
    }
    setEstimatePhase("applying");
    setError(null);

    try {
      // Phase 2-β: Confirmation Object を自動生成（23_Human_Confirmation_Model §2.1）
      // human_ui では UI 操作そのものが承認行為（23 §4.3）
      const confirmation = {
        confirmation_id: crypto.randomUUID(),
        confirmed_by: "human" as const,
        confirmed_at: new Date().toISOString(),
        ui_action: "dashboard_apply_button",
        proposed_change: {
          type: "status_change",
          from: selected.status,
          to: targetStatus,
        },
      };

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
            confirmation,
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

      // Refresh & re-select
      const newTrays = await refreshDashboard();
      const latestNode = findNodeInTrays(newTrays, selected.id);
      if (latestNode) {
        setSelected(latestNode);
      } else {
        // DONE / CANCELLED に遷移した場合、机の上から消える
        setSelected(null);
      }

      // Reset estimate flow
      setIntentDraft("");
      setEstimateResult(null);
      setEstimatePhase("idle");
      setShowCandidates(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "unknown error");
      setEstimatePhase("idle");
    }
  };

  // ─── Render ─────────────────────────────────────────────

  if (!mounted) {
    return (
      <div style={{ padding: 24, fontFamily: "sans-serif" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>
          状態が見えるダッシュボード
        </h1>
        <div style={{ color: "#666", marginTop: 4 }}>
          「机の上（アクティブ）」だけをトレーに分けて表示します
        </div>
        <div style={{ marginTop: 16 }}>読み込み中…</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>
            状態が見えるダッシュボード
          </h1>
          <div style={{ color: "#666", marginTop: 4 }}>
            「机の上（アクティブ）」だけをトレーに分けて表示します
          </div>
        </div>
        <ThemeSwitcher />
      </div>

      {/* Loading */}
      {loading && <div style={{ marginTop: 16 }}>読み込み中…</div>}

      {/* Error banner */}
      {error && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            border: "1px solid #f99",
            borderRadius: 8,
          }}
        >
          <div style={{ fontWeight: 700 }}>エラー</div>
          <div style={{ color: "#900" }}>{error}</div>
        </div>
      )}

      {/* Phase11-D: 大賢者の助言（滞留検知時のみ・アイコン＋見出し＋本文＋推奨アクション） */}
      {!loading && trays && stagnationMessage && (
        <div
          style={{
            marginTop: 16,
            padding: "14px 16px",
            border: "1px solid #5d4037",
            borderLeft: "4px solid #5d4037",
            borderRadius: 8,
            background: "#faf6f2",
            color: "#3e2723",
            fontSize: 13,
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <span style={{ fontSize: 18, lineHeight: 1.2, color: "#5d4037" }} aria-hidden>◆</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, color: "#4e342e" }}>
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
                  color: "#5d4037",
                  fontWeight: 600,
                  paddingTop: 6,
                  marginTop: 6,
                  borderTop: "1px solid rgba(93,64,55,0.2)",
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
            border: "1px solid #ddd",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: 12,
              borderBottom: "1px solid #eee",
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
                  border: viewMode === "flat" ? "2px solid #5567ff" : "1px solid #ddd",
                  borderRadius: 6,
                  background: viewMode === "flat" ? "#f5f7ff" : "white",
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
                  border: viewMode === "tree" ? "2px solid #5567ff" : "1px solid #ddd",
                  borderRadius: 6,
                  background: viewMode === "tree" ? "#f5f7ff" : "white",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                ツリー
              </button>
            </span>
          </div>

          {visibleNodes.length === 0 ? (
            <div style={{ padding: 12, color: "#666" }}>
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
              getStatusLabel={(n) => getStatusLabel((n as { status?: string }).status ?? "")}
              highlightIds={highlightNodeIds}
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
                    borderTop: "1px solid #eee",
                    cursor: "pointer",
                    background: isHighlighted ? "#fff8e1" : isSelected ? "#f5f7ff" : "white",
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
                        color: "#666",
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
                    style={{ fontSize: 12, color: "#333", whiteSpace: "nowrap" }}
                  >
                    {getStatusLabel(n.status)}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ─── Right: Detail + Estimate flow ──────────── */}
        <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
          <div style={{ fontWeight: 800 }}>詳細</div>

          {!selected ? (
            <div style={{ marginTop: 8, color: "#666" }}>
              左の一覧からタスクをクリックしてください
            </div>
          ) : (
            <div style={{ marginTop: 10 }}>
              {/* Node info */}
              <div style={{ fontWeight: 800, fontSize: 16 }}>
                {getNodeTitle(selected)}
              </div>

              <div style={{ marginTop: 8, fontSize: 13 }}>
                <div>
                  <b>状態：</b> <StatusBadge status={selected.status} />
                </div>
                {selected.temperature != null && (
                  <div style={{ marginTop: 4 }}>
                    <b>温度：</b> {selected.temperature}
                    <span style={{ fontSize: 11, color: "#999", marginLeft: 4 }}>
                      （参考値）
                    </span>
                  </div>
                )}
                {selected.context && (
                  <div style={{ marginTop: 4 }}>
                    <b>途中内容：</b>
                    <span style={{ color: "#333" }}>{selected.context}</span>
                  </div>
                )}
                <div style={{ marginTop: 4 }} suppressHydrationWarning>
                  <b>更新：</b> {selected.updated_at ?? "（不明）"}
                </div>
              </div>

              {/* Phase10-A: 関連する直近履歴 1 件（102 設計） */}
              <div
                style={{
                  marginTop: 12,
                  paddingTop: 12,
                  borderTop: "1px solid #eee",
                  fontSize: 12,
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                  関連する直近履歴
                </div>
                {relatedRecentHistoryLoading && (
                  <div style={{ color: "#666" }}>取得中…</div>
                )}
                {!relatedRecentHistoryLoading && relatedRecentHistoryError && (
                  <div style={{ color: "#c62828" }}>{relatedRecentHistoryError}</div>
                )}
                {!relatedRecentHistoryLoading && !relatedRecentHistoryError && relatedRecentHistory == null && (
                  <div style={{ color: "#666" }}>該当する履歴はありません</div>
                )}
                {!relatedRecentHistoryLoading && !relatedRecentHistoryError && relatedRecentHistory && (() => {
                  const pc = relatedRecentHistory.proposed_change ?? {};
                  const dateStr = (relatedRecentHistory.consumed_at || relatedRecentHistory.confirmed_at || "").slice(0, 19).replace("T", " ");
                  const typeLabel = getRelatedHistoryTypeLabel(pc);
                  const summary = getRelatedHistorySummary(pc);
                  const reason = pc.reason != null && String(pc.reason).trim() !== "" ? String(pc.reason) : null;
                  return (
                    <div style={{ color: "#333" }}>
                      <div><b>{typeLabel}</b> {dateStr}</div>
                      <div style={{ marginTop: 4 }}>{summary}</div>
                      {reason != null && (
                        <div style={{ marginTop: 4, fontSize: 11, color: "#555" }}>理由: {reason}</div>
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
                    background: "#e8f5e9",
                    color: "#2e7d32",
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
                  borderTop: "1px solid #eee",
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: 8 }}>
                  何が起きた？
                </div>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
                  状態の推定に使います。メモとしても履歴に残ります。
                </div>
                <textarea
                  value={intentDraft}
                  onChange={(e) => setIntentDraft(e.target.value)}
                  rows={3}
                  style={{
                    width: "100%",
                    padding: 10,
                    borderRadius: 8,
                    border: "1px solid #ccc",
                    boxSizing: "border-box",
                  }}
                  disabled={
                    estimatePhase === "loading" ||
                    estimatePhase === "applying"
                  }
                  placeholder="例：「返信待ちになった」「もう完了した」「判断に迷っている」"
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
                    border: "1px solid #ccc",
                    fontWeight: 700,
                    background:
                      estimatePhase === "loading" ? "#f3f3f3" : "white",
                    cursor:
                      !intentDraft.trim() || estimatePhase !== "idle"
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  {estimatePhase === "loading" ? "推定中…" : "推定する"}
                </button>
              </div>

              {/* ─── Estimate results ─────────────────── */}
              {estimatePhase === "preview" && estimateResult && (
                <div
                  style={{
                    marginTop: 14,
                    paddingTop: 12,
                    borderTop: "1px solid #eee",
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
                          color: "#666",
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
                            border: "1px solid #5567ff",
                            background: "#5567ff",
                            color: "white",
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
                            border: "1px solid #ccc",
                            background: "white",
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
                            border: "1px solid #ccc",
                            background: "white",
                            fontWeight: 700,
                            cursor: "pointer",
                            color: "#666",
                          }}
                        >
                          メモだけ残す
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* ── キーワードから推定できなかった場合 ── */
                    <div>
                      <div style={{ fontSize: 13, color: "#666" }}>
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
                              border: "1px solid #ddd",
                              background: "white",
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
                          border: "1px solid #ccc",
                          background: "white",
                          fontWeight: 700,
                          cursor: "pointer",
                          color: "#666",
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
                        borderTop: "1px solid #f0f0f0",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          color: "#666",
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
                                border: "1px solid #ddd",
                                background: "white",
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
                <div style={{ marginTop: 10, color: "#666" }}>反映中…</div>
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
            border: "1px solid #ddd",
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
                color: "#666",
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
                    <span style={{ color: "#888", fontStyle: "italic" }}>
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
                  border: "1px solid #b8860b",
                  borderRadius: 8,
                  background: "#fffde7",
                  fontSize: 13,
                }}
              >
                <div style={{ fontWeight: 800, color: "#8b6914", marginBottom: 8 }}>
                  ⚠ 異常を検知しました（{warnings.length}件）
                </div>
                {warnings.map((w, i) => (
                  <div
                    key={i}
                    style={{
                      marginTop: i > 0 ? 10 : 0,
                      padding: 8,
                      background: "#fff9c4",
                      borderRadius: 6,
                    }}
                  >
                    <div style={{ fontWeight: 700 }}>
                      {String(w.code ?? "UNKNOWN")}
                    </div>
                    <div style={{ marginTop: 4, color: "#333" }}>
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
                            border: "1px solid #b8860b",
                            borderRadius: 4,
                            background: "white",
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
                              background: "#f5f5f5",
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
            <div style={{ marginTop: 8, color: "#666" }}>読み込み中…</div>
          )}

          {/* 取得失敗時: 1 行でメッセージを表示 */}
          {!observerLoading && observerError && (
            <div
              style={{
                marginTop: 8,
                padding: 10,
                border: "1px solid #f99",
                borderRadius: 6,
                background: "#fff5f5",
                color: "#900",
                fontSize: 13,
              }}
            >
              {observerError}
            </div>
          )}

          {/* report が null のとき（API が ok: true, report: null を返した場合） */}
          {!observerLoading && !observerError && !observerReport && (
            <div style={{ marginTop: 8, color: "#666" }}>
              観測結果がまだありません。Actions で Observer Cron を実行するか、ローカルで python main.py --save を実行してください。
            </div>
          )}

          {/* report あり: payload を表示 */}
          {!observerLoading && observerReport && (() => {
            const payload = (observerReport as Record<string, unknown>)
              .payload as Record<string, unknown> | null | undefined;
            if (!payload) {
              return (
                <div style={{ marginTop: 8, color: "#666", fontSize: 13 }}>
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
                      color: "#333",
                      padding: 8,
                      background: "#f8f9fa",
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
                      border: "1px solid #5567ff",
                      borderRadius: 8,
                      background: "#f5f7ff",
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13 }}>
                      今やるとよさそうなこと
                    </div>
                    <div style={{ fontWeight: 800, marginTop: 4 }}>
                      {suggestedNext.title as string}
                    </div>
                    <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                      {suggestedNext.reason as string}
                    </div>
                    <div style={{ fontSize: 12, color: "#444", marginTop: 4 }}>
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
                          border: "1px solid #eee",
                          borderRadius: 6,
                          marginBottom: 4,
                          fontSize: 13,
                        }}
                      >
                        <b>{p.title as string}</b>
                        <span style={{ color: "#666", marginLeft: 8 }}>
                          {p.current_status as string} →{" "}
                          {p.suggested_status as string}
                        </span>
                        <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>
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
                          border: "1px solid #ffd54f",
                          borderRadius: 6,
                          background: "#fffde7",
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
          onRefreshDashboard={refreshDashboard}
          onHistoryItemSelect={handleHistoryItemSelect}
        />
      )}
    </div>
  );
}
