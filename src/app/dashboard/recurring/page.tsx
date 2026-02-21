"use client";

/**
 * 繰り返しタスク設定 — ルール一覧・追加・編集・削除・有効/停止
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { createClient } from "@/lib/supabase/client";

// ─── ボタンスタイル ────────────────────────────────────────────

const btnBase: React.CSSProperties = {
  borderRadius: 8,
  fontWeight: 600,
  cursor: "pointer",
  border: "1px solid var(--border-default)",
  background: "var(--bg-card)",
  color: "var(--text-primary)",
  fontSize: 13,
};

const btnPrimary = (disabled = false): React.CSSProperties => ({
  ...btnBase,
  padding: "8px 16px",
  background: "var(--color-info)",
  color: "#fff",
  border: "none",
  opacity: disabled ? 0.6 : 1,
  cursor: disabled ? "not-allowed" : "pointer",
  transition: "opacity 150ms ease",
});

const btnSecondary = (disabled = false): React.CSSProperties => ({
  ...btnBase,
  padding: "8px 16px",
  opacity: disabled ? 0.6 : 1,
  cursor: disabled ? "not-allowed" : "pointer",
});

const btnSmall: React.CSSProperties = {
  ...btnBase,
  padding: "4px 10px",
  fontSize: 12,
  borderRadius: 6,
};

const btnDanger: React.CSSProperties = {
  ...btnBase,
  padding: "4px 10px",
  fontSize: 12,
  borderRadius: 6,
  color: "var(--color-danger)",
  border: "1px solid var(--border-danger)",
  background: "transparent",
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: "7px 10px",
  fontSize: 14,
  borderRadius: 6,
  border: "1px solid var(--border-default)",
  background: "var(--bg-muted)",
  color: "var(--text-primary)",
  outline: "none",
};

// ─── 共通コンポーネント ────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontWeight: 700,
      fontSize: 11,
      letterSpacing: "0.06em",
      textTransform: "uppercase",
      color: "var(--text-secondary)",
      marginBottom: 10,
    }}>
      {children}
    </div>
  );
}

function LogoutButton() {
  const router = useRouter();
  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }
  return (
    <button
      type="button"
      onClick={handleLogout}
      style={{
        padding: "7px 14px",
        borderRadius: 8,
        border: "1px solid var(--border-default)",
        background: "var(--bg-card)",
        color: "var(--text-secondary)",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      ログアウト
    </button>
  );
}

// ─── 型定義 ───────────────────────────────────────────────────

type Rule = {
  id: string;
  user_id: string;
  title: string;
  schedule_type: string;
  time_of_day: string;
  start_at: string;
  end_at: string | null;
  next_run_at: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_run_at: string | null;
  last_run_for_date: string | null;
};

const SCHEDULE_LABELS: Record<string, string> = {
  daily: "毎日",
  weekly: "毎週",
  monthly: "毎月",
};

function formatDate(iso: string | null): string {
  if (!iso) return "無期限";
  return iso.slice(0, 10).replace(/-/g, "/");
}

function formatLastRun(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${day} ${h}:${min}`;
}

// ─── メインページ ─────────────────────────────────────────────

export default function RecurringPage() {
  const [items, setItems] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [runNowLoading, setRunNowLoading] = useState(false);
  const [runNowMessage, setRunNowMessage] = useState<string | null>(null);
  const [runNowIsError, setRunNowIsError] = useState(false);
  const [runNowDebug, setRunNowDebug] = useState<{
    todayJST: string;
    endOfTodayJSTUTC: string;
    activeRuleCount: number;
    inTimeRangeCount: number;
    selectedCount: number;
  } | null>(null);
  const [runNowResults, setRunNowResults] = useState<Array<{ id: string; created: boolean; error?: string; skipReason?: string; next_run_date_jst?: string }>>([]);
  const [clearingId, setClearingId] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<Array<{
    id: string;
    rule_id: string | null;
    run_at: string;
    run_for_date: string | null;
    trigger: string;
    created_node_id: string | null;
    processed_count: number | null;
    created_count: number | null;
  }>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/recurring", { cache: "no-store" });
    const data = await res.json();
    setLoading(false);
    if (!data.ok) {
      setError(data.error ?? "取得に失敗しました");
      setItems([]);
      return;
    }
    setItems(Array.isArray(data.items) ? data.items : []);
  }, []);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    const res = await fetch("/api/recurring/history", { cache: "no-store" });
    const data = await res.json();
    setHistoryLoading(false);
    if (data.ok && Array.isArray(data.items)) {
      setHistoryItems(data.items);
    }
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);
  useEffect(() => { if (!loading) fetchHistory(); }, [loading, fetchHistory]);

  const [formTitle, setFormTitle] = useState("");
  const [formScheduleType, setFormScheduleType] = useState<"daily" | "weekly" | "monthly">("daily");
  const [formStartAt, setFormStartAt] = useState("");
  const [formEndAt, setFormEndAt] = useState("");

  function resetForm() {
    setFormTitle("");
    setFormScheduleType("daily");
    setFormStartAt(new Date().toISOString().slice(0, 10));
    setFormEndAt("");
  }

  function openEdit(rule: Rule) {
    setEditingId(rule.id);
    setFormTitle(rule.title);
    setFormScheduleType((rule.schedule_type as "daily" | "weekly" | "monthly") || "daily");
    setFormStartAt(rule.start_at.slice(0, 10));
    setFormEndAt(rule.end_at ? rule.end_at.slice(0, 10) : "");
  }

  async function handleSubmitNew(e: React.FormEvent) {
    e.preventDefault();
    const startAt = formStartAt ? `${formStartAt}T00:00:00.000Z` : "";
    if (!startAt) { alert("開始日を入力してください"); return; }
    const res = await fetch("/api/recurring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: formTitle.trim(), schedule_type: formScheduleType, time_of_day: "00:00", start_at: startAt, end_at: formEndAt.trim() || null }),
    });
    const data = await res.json();
    if (!data.ok) { alert(data.error ?? "保存に失敗しました"); return; }
    setAdding(false);
    resetForm();
    fetchRules();
  }

  async function handleSubmitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    const startAt = formStartAt ? `${formStartAt}T00:00:00.000Z` : "";
    if (!startAt) { alert("開始日を入力してください"); return; }
    const res = await fetch(`/api/recurring/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: formTitle.trim(), schedule_type: formScheduleType, time_of_day: "00:00", start_at: startAt, end_at: formEndAt.trim() || null }),
    });
    const data = await res.json();
    if (!data.ok) { alert(data.error ?? "更新に失敗しました"); return; }
    setEditingId(null);
    resetForm();
    fetchRules();
  }

  async function toggleActive(rule: Rule) {
    const res = await fetch(`/api/recurring/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !rule.is_active }),
    });
    const data = await res.json();
    if (!data.ok) { alert(data.error ?? "更新に失敗しました"); return; }
    fetchRules();
  }

  async function confirmDelete() {
    if (!deletingId) return;
    const res = await fetch(`/api/recurring/${deletingId}`, { method: "DELETE" });
    const data = await res.json();
    setDeletingId(null);
    if (!data.ok) { alert(data.error ?? "削除に失敗しました"); return; }
    fetchRules();
  }

  async function handleRunNow() {
    setRunNowMessage(null);
    setRunNowIsError(false);
    setRunNowDebug(null);
    setRunNowResults([]);
    setRunNowLoading(true);
    const res = await fetch("/api/recurring/run-now", { method: "POST" });
    const data = await res.json();
    setRunNowLoading(false);
    if (!data.ok) {
      setRunNowMessage(data.error ?? "実行に失敗しました");
      setRunNowIsError(true);
      return;
    }
    const created = data.created ?? 0;
    setRunNowDebug(data.debug ?? null);
    setRunNowResults(Array.isArray(data.results) ? data.results : []);
    setRunNowMessage(
      created > 0
        ? `${created} 件のタスクを生成しました`
        : "対象ルールなし（今日分は実行済み、または次回実行日が先）"
    );
    fetchRules();
    fetchHistory();
  }

  async function handleClearHistory(ruleId: string) {
    setClearingId(ruleId);
    const res = await fetch(`/api/recurring/${ruleId}/clear`, { method: "POST" });
    const data = await res.json();
    setClearingId(null);
    if (!data.ok) { alert(data.error ?? "クリアに失敗しました"); return; }
    fetchRules();
    fetchHistory();
  }

  const labelSpan: React.CSSProperties = {
    width: 72,
    fontSize: 13,
    color: "var(--text-secondary)",
    flexShrink: 0,
  };

  const formBlock = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 420 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={labelSpan}>タイトル</span>
        <input type="text" value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="生成されるタスク名" style={inputStyle} required />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={labelSpan}>繰り返し</span>
        <select value={formScheduleType} onChange={(e) => setFormScheduleType(e.target.value as "daily" | "weekly" | "monthly")} style={{ ...inputStyle, flex: "none", width: "auto" }}>
          <option value="daily">毎日</option>
          <option value="weekly">毎週</option>
          <option value="monthly">毎月</option>
        </select>
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={labelSpan}>開始日</span>
        <input type="date" value={formStartAt} onChange={(e) => setFormStartAt(e.target.value)} style={{ ...inputStyle, flex: "none", width: "auto" }} required />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={labelSpan}>終了日</span>
        <input type="date" value={formEndAt} onChange={(e) => setFormEndAt(e.target.value)} style={{ ...inputStyle, flex: "none", width: "auto" }} />
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>未入力＝無期限</span>
      </label>
    </div>
  );

  return (
    <div style={{ padding: "20px 24px 48px", background: "var(--bg-page)", color: "var(--text-primary)", minHeight: "100vh" }}>

      {/* ─── ページヘッダー ─── */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 12,
        paddingBottom: 16,
        borderBottom: "1px solid var(--border-subtle)",
        marginBottom: 24,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link
            href="/dashboard"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: "var(--text-secondary)",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 500,
              padding: "6px 2px",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            ダッシュボード
          </Link>
          <div style={{ width: 1, height: 20, background: "var(--border-subtle)" }} />
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.2 }}>繰り返しタスク</h1>
            <div style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 2 }}>
              スケジュールに従ってタスクを自動生成
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleRunNow}
            disabled={runNowLoading}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 14px",
              borderRadius: 8,
              border: "none",
              background: "var(--color-info)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 600,
              cursor: runNowLoading ? "not-allowed" : "pointer",
              opacity: runNowLoading ? 0.7 : 1,
              transition: "opacity 150ms ease",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            {runNowLoading ? "実行中…" : "今すぐ実行"}
          </button>
          <ThemeSwitcher />
          <LogoutButton />
        </div>
      </div>

      {/* ─── 実行結果メッセージ ─── */}
      {runNowMessage && (
        <div style={{
          marginBottom: 16,
          padding: "10px 14px",
          borderRadius: 8,
          background: runNowIsError ? "var(--bg-danger)" : "var(--bg-success)",
          color: runNowIsError ? "var(--text-danger)" : "var(--text-success)",
          fontSize: 13,
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}>
          {runNowIsError
            ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          }
          {runNowMessage}
        </div>
      )}

      {/* ─── 診断パネル ─── */}
      {runNowDebug && (
        <div style={{
          marginBottom: 16,
          padding: "10px 14px",
          background: "var(--bg-card)",
          border: "1px solid var(--border-default)",
          borderRadius: 8,
          fontSize: 12,
          color: "var(--text-secondary)",
        }}>
          <div style={{ fontWeight: 700, fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: 6 }}>診断</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 20px" }}>
            <span>今日(JST): <b style={{ color: "var(--text-primary)" }}>{runNowDebug.todayJST}</b></span>
            <span>有効: <b style={{ color: "var(--text-primary)" }}>{runNowDebug.activeRuleCount}件</b></span>
            <span>範囲内: <b style={{ color: "var(--text-primary)" }}>{runNowDebug.inTimeRangeCount}件</b></span>
            <span>対象: <b style={{ color: "var(--text-primary)" }}>{runNowDebug.selectedCount}件</b></span>
          </div>
          {runNowResults.some((r) => r.skipReason) && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border-subtle)", display: "flex", flexDirection: "column", gap: 3 }}>
              {runNowResults.map((r) => {
                if (!r.skipReason) return null;
                const rule = items.find((x) => x.id === r.id);
                const label = rule?.title ?? r.id.slice(0, 8);
                const reason =
                  r.skipReason === "next_run_date_future" ? `次回実行日が先（${r.next_run_date_jst ?? "?"} > ${runNowDebug.todayJST}）`
                  : r.skipReason === "already_run_today" ? "今日分は実行済み"
                  : r.skipReason === "end_at_exceeded" ? "終了日を超過"
                  : r.skipReason === "before_start" ? "開始日前"
                  : r.skipReason ?? r.error ?? "—";
                return (
                  <div key={r.id} style={{ color: "var(--text-muted)" }}>
                    <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>{label}</span>: {reason}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {loading && <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>取得中…</p>}
      {error && <p style={{ color: "var(--text-danger)", fontSize: 13 }}>{error}</p>}

      {!loading && !error && (
        <div>

          {/* ─── 新規追加フォーム ─── */}
          {adding && (
            <div style={{
              marginBottom: 16,
              border: "1px solid var(--border-focus)",
              borderRadius: 10,
              background: "var(--bg-card)",
              overflow: "hidden",
            }}>
              <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-card)" }}>
                <SectionLabel>新規ルールを追加</SectionLabel>
              </div>
              <div style={{ padding: "14px 16px" }}>
                <form onSubmit={handleSubmitNew}>
                  {formBlock}
                  <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                    <button type="submit" style={btnPrimary()}>保存</button>
                    <button type="button" onClick={() => { setAdding(false); resetForm(); }} style={btnSecondary()}>キャンセル</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ─── ルール一覧 ─── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((rule) => (
              <div
                key={rule.id}
                style={{
                  border: "1px solid var(--border-default)",
                  borderLeft: `3px solid ${rule.is_active ? "var(--color-success)" : "var(--border-muted)"}`,
                  borderRadius: 10,
                  background: "var(--bg-card)",
                  overflow: "hidden",
                  transition: "border-color 150ms ease",
                }}
              >
                {editingId === rule.id ? (
                  <div style={{ padding: "12px 16px" }}>
                    <SectionLabel>編集</SectionLabel>
                    <form onSubmit={handleSubmitEdit}>
                      {formBlock}
                      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                        <button type="submit" style={btnPrimary()}>保存</button>
                        <button type="button" onClick={() => { setEditingId(null); resetForm(); }} style={btnSecondary()}>キャンセル</button>
                      </div>
                    </form>
                  </div>
                ) : (
                  <div style={{ padding: "12px 14px" }}>
                    {/* タイトル行 */}
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.3 }}>{rule.title}</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                          {/* スケジュール pill */}
                          <span style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            padding: "2px 8px", borderRadius: 4,
                            background: "var(--bg-badge)", fontSize: 11, fontWeight: 600,
                            color: "var(--text-secondary)",
                          }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21.5 2v6h-6"/><path d="M2.5 12A10 10 0 0 1 20.1 6.8"/>
                              <path d="M2.5 22v-6h6"/><path d="M21.5 12A10 10 0 0 1 3.9 17.2"/>
                            </svg>
                            {SCHEDULE_LABELS[rule.schedule_type] ?? rule.schedule_type}
                          </span>
                          {/* 開始日 */}
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 4, background: "var(--bg-badge)", fontSize: 11, color: "var(--text-secondary)" }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                            </svg>
                            {formatDate(rule.start_at)} → {formatDate(rule.end_at)}
                          </span>
                        </div>
                        <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-muted)" }}>
                          最終実行: {formatLastRun(rule.last_run_at)}
                        </div>
                      </div>
                      {/* 有効/停止バッジ */}
                      <button
                        type="button"
                        onClick={() => toggleActive(rule)}
                        style={{
                          flexShrink: 0,
                          padding: "3px 10px",
                          borderRadius: 20,
                          fontSize: 11,
                          fontWeight: 700,
                          border: "none",
                          cursor: "pointer",
                          background: rule.is_active ? "var(--bg-success)" : "var(--bg-disabled)",
                          color: rule.is_active ? "var(--text-success)" : "var(--text-muted)",
                          transition: "background 150ms ease, color 150ms ease",
                        }}
                        title={rule.is_active ? "クリックで停止" : "クリックで有効化"}
                      >
                        {rule.is_active ? "有効" : "停止中"}
                      </button>
                    </div>

                    {/* アクション行 */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 8, borderTop: "1px solid var(--border-subtle)" }}>
                      <button type="button" onClick={() => openEdit(rule)} style={btnSmall}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                          編集
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleClearHistory(rule.id)}
                        disabled={clearingId === rule.id}
                        title="実行履歴をクリアすると、同じ日に再度タスクを生成できます"
                        style={{ ...btnSmall, opacity: clearingId === rule.id ? 0.6 : 1, cursor: clearingId === rule.id ? "not-allowed" : "pointer" }}
                      >
                        {clearingId === rule.id ? "クリア中…" : "履歴クリア"}
                      </button>
                      <button type="button" onClick={() => setDeletingId(rule.id)} style={btnDanger}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                            <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                          </svg>
                          削除
                        </span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* ─── ルール追加ボタン ─── */}
          {!adding && (
            <button
              type="button"
              onClick={() => { setAdding(true); resetForm(); }}
              style={{
                marginTop: 10,
                width: "100%",
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px dashed var(--border-muted)",
                background: "transparent",
                color: "var(--text-secondary)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                transition: "border-color 150ms ease, color 150ms ease",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              ルールを追加
            </button>
          )}

          {/* ─── 実行ログ ─── */}
          <div style={{
            marginTop: 32,
            border: "1px solid var(--border-default)",
            borderRadius: 10,
            background: "var(--bg-card)",
            overflow: "hidden",
          }}>
            <div style={{
              padding: "10px 14px",
              borderBottom: "1px solid var(--border-subtle)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <SectionLabel>実行ログ</SectionLabel>
              <button
                type="button"
                onClick={fetchHistory}
                disabled={historyLoading}
                style={{ ...btnSmall, opacity: historyLoading ? 0.6 : 1, cursor: historyLoading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 4 }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6"/><path d="M2.5 12A10 10 0 0 1 20.1 6.8"/>
                  <path d="M2.5 22v-6h6"/><path d="M21.5 12A10 10 0 0 1 3.9 17.2"/>
                </svg>
                {historyLoading ? "取得中…" : "再取得"}
              </button>
            </div>
            <div style={{ padding: "10px 14px" }}>
              {historyLoading && historyItems.length === 0 ? (
                <p style={{ color: "var(--text-secondary)", fontSize: 13, margin: 0 }}>取得中…</p>
              ) : historyItems.length === 0 ? (
                <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>履歴はまだありません</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600, fontSize: 11, letterSpacing: "0.04em", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-default)" }}>実行日時</th>
                        <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600, fontSize: 11, letterSpacing: "0.04em", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-default)" }}>ルール</th>
                        <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600, fontSize: 11, letterSpacing: "0.04em", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-default)" }}>種別</th>
                        <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600, fontSize: 11, letterSpacing: "0.04em", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-default)" }}>対象日</th>
                        <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600, fontSize: 11, letterSpacing: "0.04em", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-default)" }}>処理</th>
                        <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600, fontSize: 11, letterSpacing: "0.04em", color: "var(--text-secondary)", borderBottom: "1px solid var(--border-default)" }}>生成</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyItems.map((row) => (
                        <tr key={row.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                          <td style={{ padding: "7px 8px", whiteSpace: "nowrap", color: "var(--text-primary)" }}>{formatLastRun(row.run_at)}</td>
                          <td style={{ padding: "7px 8px", color: "var(--text-secondary)" }}>{row.rule_id ? (items.find((r) => r.id === row.rule_id)?.title ?? row.rule_id.slice(0, 8)) : <span style={{ color: "var(--text-muted)" }}>ジョブ</span>}</td>
                          <td style={{ padding: "7px 8px" }}>
                            <span style={{
                              padding: "1px 6px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                              background: row.trigger === "cron" ? "var(--bg-badge)" : row.trigger === "manual" ? "var(--color-info-bg)" : "var(--bg-badge)",
                              color: row.trigger === "cron" ? "var(--text-secondary)" : row.trigger === "manual" ? "var(--color-info)" : "var(--text-secondary)",
                            }}>
                              {row.trigger === "cron" ? "自動" : row.trigger === "manual" ? "手動" : row.trigger === "clear" ? "クリア" : row.trigger}
                            </span>
                          </td>
                          <td style={{ padding: "7px 8px", color: "var(--text-secondary)" }}>{row.run_for_date ? row.run_for_date.replace(/-/g, "/") : "—"}</td>
                          <td style={{ padding: "7px 8px", textAlign: "right", color: "var(--text-secondary)" }}>{row.processed_count != null ? row.processed_count : "—"}</td>
                          <td style={{ padding: "7px 8px", textAlign: "right", fontWeight: row.created_count ? 700 : 400, color: row.created_count ? "var(--text-success)" : "var(--text-muted)" }}>
                            {row.created_count != null ? row.created_count : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── 削除確認ダイアログ ─── */}
      {deletingId && (
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onKeyDown={(e) => e.key === "Escape" && setDeletingId(null)}
        >
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-danger)", padding: 24, borderRadius: 12, maxWidth: 360, width: "90%", boxShadow: "var(--shadow-elevated)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-danger)", flexShrink: 0 }}>
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <div style={{ fontWeight: 700, fontSize: 15 }}>削除しますか？</div>
            </div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20 }}>
              このルールと関連する設定を削除します。この操作は取り消せません。
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setDeletingId(null)} style={btnSecondary()}>キャンセル</button>
              <button type="button" onClick={confirmDelete} style={{ ...btnPrimary(), background: "var(--color-danger)" }}>削除する</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
