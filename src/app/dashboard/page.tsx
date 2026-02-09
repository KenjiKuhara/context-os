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

import { useCallback, useEffect, useMemo, useState } from "react";
import { STATUS_LABELS } from "@/lib/stateMachine";

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

const TRAY_LABEL: Record<keyof Trays | "all", string> = {
  all: "全て（机の上）",
  in_progress: "実施中",
  needs_decision: "判断待ち",
  waiting_external: "外部待ち",
  cooling: "冷却中",
  other_active: "その他",
};

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
      {status}（{getStatusLabel(status)}）
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

  // ─── Data fetch ─────────────────────────────────────────

  const refreshDashboard = useCallback(async () => {
    const res = await fetch("/api/dashboard", { cache: "no-store" });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "API error");
    setTrays(json.trays as Trays);
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
          ? `${json.from_status}（${getStatusLabel(json.from_status)}）→ ${json.to_status}（${getStatusLabel(json.to_status)}）に変更しました`
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
      <h1 style={{ fontSize: 24, fontWeight: 800 }}>
        状態が見えるダッシュボード
      </h1>
      <div style={{ color: "#666", marginTop: 4 }}>
        「机の上（アクティブ）」だけをトレーに分けて表示します
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
            }}
          >
            一覧：{TRAY_LABEL[activeTrayKey]}
          </div>

          {visibleNodes.length === 0 ? (
            <div style={{ padding: 12, color: "#666" }}>
              対象のノードがありません
            </div>
          ) : (
            visibleNodes.map((n) => {
              const title = getNodeTitle(n);
              const subtext = getNodeSubtext(n);
              const isSelected = selected?.id === n.id;
              return (
                <div
                  key={n.id}
                  onClick={() => setSelected(n)}
                  style={{
                    padding: 12,
                    borderTop: "1px solid #eee",
                    cursor: "pointer",
                    background: isSelected ? "#f5f7ff" : "white",
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
                    {n.status}
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
              左の一覧からノードをクリックしてください
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
                      （参考値・06_Temperature_Spec準拠）
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
                            {c.status}（{c.label}）
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
                              {c.status}（{c.label}）
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
            Observer の提案
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
                <b>source:</b>{" "}
                {((observerReport as Record<string, unknown>).source as string) ?? "—"}
              </span>
              <span>
                <b>node_count:</b>{" "}
                {String((observerReport as Record<string, unknown>).node_count ?? "—")}
              </span>
              <span>
                <b>rule_version:</b>{" "}
                {(() => {
                  const payload = (observerReport as Record<string, unknown>).payload as Record<string, unknown> | undefined;
                  const debug = payload?.suggested_next && typeof payload.suggested_next === "object" && (payload.suggested_next as Record<string, unknown>).debug;
                  const ver = debug && typeof debug === "object" && (debug as Record<string, unknown>).rule_version;
                  return ver != null ? String(ver) : "—";
                })()}
              </span>
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
                  ⚠ Observer が異常を検知しました（{warnings.length}件）
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
              Observer レポートがまだありません。Actions で Observer Cron を実行するか、ローカルで python main.py --save を実行してください。
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
    </div>
  );
}
