"use client";

/**
 * 繰り返しタスク設定 — ルール一覧・追加・編集・削除・有効/停止
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { createClient } from "@/lib/supabase/client";

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
        padding: "8px 14px",
        borderRadius: 8,
        border: "1px solid var(--border-default)",
        background: "var(--bg-card)",
        color: "var(--text-primary)",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      ログアウト
    </button>
  );
}

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
  if (!iso) return "なし";
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

function ruleSummary(r: Rule): string {
  const schedule = SCHEDULE_LABELS[r.schedule_type] ?? r.schedule_type;
  return `🔁 ${schedule} / 開始: ${formatDate(r.start_at)} / 終了: ${formatDate(r.end_at)}`;
}

export default function RecurringPage() {
  const [items, setItems] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [runNowLoading, setRunNowLoading] = useState(false);
  const [runNowMessage, setRunNowMessage] = useState<string | null>(null);
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

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  useEffect(() => {
    if (!loading) fetchHistory();
  }, [loading, fetchHistory]);

  const [formTitle, setFormTitle] = useState("");
  const [formScheduleType, setFormScheduleType] = useState<"daily" | "weekly" | "monthly">("daily");
  const [formStartAt, setFormStartAt] = useState("");
  const [formEndAt, setFormEndAt] = useState("");

  function resetForm() {
    setFormTitle("");
    setFormScheduleType("daily");
    const today = new Date().toISOString().slice(0, 10);
    setFormStartAt(today);
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
    if (!startAt) {
      alert("開始日を入力してください");
      return;
    }
    const res = await fetch("/api/recurring", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: formTitle.trim(),
        schedule_type: formScheduleType,
        time_of_day: "00:00",
        start_at: startAt,
        end_at: formEndAt.trim() || null,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      alert(data.error ?? "保存に失敗しました");
      return;
    }
    setAdding(false);
    resetForm();
    fetchRules();
  }

  async function handleSubmitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    const startAt = formStartAt ? `${formStartAt}T00:00:00.000Z` : "";
    if (!startAt) {
      alert("開始日を入力してください");
      return;
    }
    const res = await fetch(`/api/recurring/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: formTitle.trim(),
        schedule_type: formScheduleType,
        time_of_day: "00:00",
        start_at: startAt,
        end_at: formEndAt.trim() || null,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      alert(data.error ?? "更新に失敗しました");
      return;
    }
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
    if (!data.ok) {
      alert(data.error ?? "更新に失敗しました");
      return;
    }
    fetchRules();
  }

  async function confirmDelete() {
    if (!deletingId) return;
    const res = await fetch(`/api/recurring/${deletingId}`, { method: "DELETE" });
    const data = await res.json();
    setDeletingId(null);
    if (!data.ok) {
      alert(data.error ?? "削除に失敗しました");
      return;
    }
    fetchRules();
  }

  async function handleRunNow() {
    setRunNowMessage(null);
    setRunNowDebug(null);
    setRunNowResults([]);
    setRunNowLoading(true);
    const res = await fetch("/api/recurring/run-now", { method: "POST" });
    const data = await res.json();
    setRunNowLoading(false);
    if (!data.ok) {
      setRunNowMessage(data.error ?? "実行に失敗しました");
      return;
    }
    const created = data.created ?? 0;
    const debug = data.debug ?? null;
    const results = Array.isArray(data.results) ? data.results : [];
    setRunNowDebug(debug);
    setRunNowResults(results);

    if (created > 0) {
      setRunNowMessage(`${created} 件のタスクを生成しました。ダッシュボードで確認できます。`);
    } else {
      setRunNowMessage("対象のルールはありません（今日分は実行済み、または次回実行時刻がまだ先の場合は生成されません）");
    }
    fetchRules();
    fetchHistory();
  }

  async function handleClearHistory(ruleId: string) {
    setClearingId(ruleId);
    const res = await fetch(`/api/recurring/${ruleId}/clear`, { method: "POST" });
    const data = await res.json();
    setClearingId(null);
    if (!data.ok) {
      alert(data.error ?? "クリアに失敗しました");
      return;
    }
    fetchRules();
    fetchHistory();
  }

  const formBlock = (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 400 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 90 }}>タイトル</span>
        <input
          type="text"
          value={formTitle}
          onChange={(e) => setFormTitle(e.target.value)}
          placeholder="生成されるタスク名"
          style={{ flex: 1, padding: 6 }}
          required
        />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 90 }}>繰り返し</span>
        <select
          value={formScheduleType}
          onChange={(e) => setFormScheduleType(e.target.value as "daily" | "weekly" | "monthly")}
          style={{ padding: 6 }}
        >
          <option value="daily">毎日</option>
          <option value="weekly">毎週</option>
          <option value="monthly">毎月</option>
        </select>
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 90 }}>開始日</span>
        <input
          type="date"
          value={formStartAt}
          onChange={(e) => setFormStartAt(e.target.value)}
          style={{ padding: 6 }}
          required
        />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 90 }}>終了日</span>
        <input
          type="date"
          value={formEndAt}
          onChange={(e) => setFormEndAt(e.target.value)}
          placeholder="未入力＝無期限"
          style={{ padding: 6 }}
        />
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>未入力＝無期限</span>
      </label>
    </div>
  );

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", background: "var(--bg-page)", color: "var(--text-primary)", minHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800 }}>繰り返しタスク</h1>
          <div style={{ color: "var(--text-secondary)", marginTop: 4 }}>
            ルールを保存し、実行日が来たらタスクを1件だけ自動生成します
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={handleRunNow}
            disabled={runNowLoading}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "1px solid var(--border-focus)",
              background: "var(--color-info)",
              color: "var(--text-on-primary)",
              fontSize: 13,
              fontWeight: 600,
              cursor: runNowLoading ? "not-allowed" : "pointer",
            }}
          >
            {runNowLoading ? "実行中…" : "今すぐ実行"}
          </button>
          <Link
            href="/dashboard"
            style={{ color: "var(--color-info)", textDecoration: "underline" }}
          >
            ダッシュボード
          </Link>
          <ThemeSwitcher />
          <LogoutButton />
        </div>
      </div>

      {runNowMessage && (
        <p style={{ marginTop: 12, padding: 10, background: "var(--bg-muted)", borderRadius: 8, color: "var(--text-primary)" }}>
          {runNowMessage}
        </p>
      )}
      {runNowDebug && (
        <div style={{ marginTop: 8, padding: 12, background: "var(--bg-card)", border: "1px solid var(--border-default)", borderRadius: 8, fontSize: 13 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>診断</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, color: "var(--text-secondary)" }}>
            <span>今日(JST): {runNowDebug.todayJST} / 終了時刻(UTC): {runNowDebug.endOfTodayJSTUTC}</span>
            <span>有効なルール: {runNowDebug.activeRuleCount}件 / 次回実行時刻が今日以内: {runNowDebug.inTimeRangeCount}件 / 今日分未実行で対象: {runNowDebug.selectedCount}件</span>
            {runNowResults.some((r) => r.skipReason) && (
              <div style={{ marginTop: 6 }}>
                {runNowResults.map((r) => {
                  const rule = items.find((x) => x.id === r.id);
                  const label = rule?.title ?? r.id.slice(0, 8);
                  const reason =
                    r.skipReason === "next_run_date_future"
                      ? `次回実行日(JST)が今日より先（${r.next_run_date_jst ?? "?"} > ${runNowDebug.todayJST}）`
                      : r.skipReason === "already_run_today"
                        ? "今日分は実行済み"
                        : r.skipReason === "end_at_exceeded"
                          ? "終了日を超過"
                          : r.skipReason === "before_start"
                            ? "開始日前"
                            : r.skipReason ?? r.error ?? "—";
                  return (
                    <div key={r.id} style={{ fontSize: 12, marginTop: 2 }}>
                      {label}: {reason}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
      {loading && <p style={{ color: "var(--text-secondary)" }}>取得中…</p>}
      {error && <p style={{ color: "var(--text-danger)" }}>{error}</p>}

      {!loading && !error && (
        <div style={{ marginTop: 24 }}>
          {adding && (
            <div style={{ marginBottom: 24, padding: 16, border: "1px solid var(--border-default)", borderRadius: 8 }}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>新規追加</div>
              <form onSubmit={handleSubmitNew}>
                {formBlock}
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button type="submit" style={{ padding: "8px 16px", borderRadius: 8, cursor: "pointer" }}>保存</button>
                  <button type="button" onClick={() => { setAdding(false); resetForm(); }} style={{ padding: "8px 16px", borderRadius: 8, cursor: "pointer" }}>キャンセル</button>
                </div>
              </form>
            </div>
          )}

          {items.map((rule) => (
            <div
              key={rule.id}
              style={{
                marginBottom: 12,
                padding: 14,
                border: "1px solid var(--border-default)",
                borderRadius: 8,
                background: "var(--bg-card)",
              }}
            >
              {editingId === rule.id ? (
                <form onSubmit={handleSubmitEdit}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>編集</div>
                  {formBlock}
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button type="submit" style={{ padding: "8px 16px", borderRadius: 8, cursor: "pointer" }}>保存</button>
                    <button type="button" onClick={() => { setEditingId(null); resetForm(); }} style={{ padding: "8px 16px", borderRadius: 8, cursor: "pointer" }}>キャンセル</button>
                  </div>
                </form>
              ) : (
                <>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{rule.title}</div>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 4 }}>{ruleSummary(rule)}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
                    最後に実行: {formatLastRun(rule.last_run_at)}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => toggleActive(rule)}
                      style={{
                        padding: "4px 10px",
                        fontSize: 12,
                        borderRadius: 6,
                        cursor: "pointer",
                        border: "1px solid var(--border-default)",
                        background: rule.is_active ? "var(--bg-card)" : "var(--bg-muted)",
                        color: "var(--text-primary)",
                      }}
                    >
                      {rule.is_active ? "有効" : "停止"}
                    </button>
                    <button type="button" onClick={() => openEdit(rule)} style={{ padding: "4px 10px", fontSize: 12, borderRadius: 6, cursor: "pointer" }}>編集</button>
                    <button
                      type="button"
                      onClick={() => handleClearHistory(rule.id)}
                      disabled={clearingId === rule.id}
                      style={{ padding: "4px 10px", fontSize: 12, borderRadius: 6, cursor: clearingId === rule.id ? "not-allowed" : "pointer", color: "var(--text-secondary)" }}
                      title="実行履歴をクリアすると、同じ日にもう一度「今すぐ実行」またはジョブでタスクを1件追加できます"
                    >
                      {clearingId === rule.id ? "クリア中…" : "実行履歴クリア"}
                    </button>
                    <button type="button" onClick={() => setDeletingId(rule.id)} style={{ padding: "4px 10px", fontSize: 12, borderRadius: 6, cursor: "pointer", color: "var(--text-danger)" }}>削除</button>
                  </div>
                </>
              )}
            </div>
          ))}

          {!adding && (
            <button
              type="button"
              onClick={() => { setAdding(true); resetForm(); setFormStartAt(new Date().toISOString().slice(0, 10)); }}
              style={{ marginTop: 12, padding: "8px 16px", borderRadius: 8, cursor: "pointer" }}
            >
              ＋ ルールを追加
            </button>
          )}

          <div style={{ marginTop: 32, padding: 16, border: "1px solid var(--border-default)", borderRadius: 8, background: "var(--bg-card)" }}>
            <div style={{ fontWeight: 700, marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>実行ログ</span>
              <button type="button" onClick={fetchHistory} disabled={historyLoading} style={{ fontSize: 12, padding: "4px 8px", cursor: historyLoading ? "not-allowed" : "pointer" }}>
                {historyLoading ? "再取得中…" : "再取得"}
              </button>
            </div>
            {historyLoading && historyItems.length === 0 ? (
              <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>取得中…</p>
            ) : historyItems.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: 13 }}>履歴はまだありません</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-default)" }}>
                      <th style={{ textAlign: "left", padding: "6px 8px" }}>実行日時</th>
                      <th style={{ textAlign: "left", padding: "6px 8px" }}>ルール / ジョブ</th>
                      <th style={{ textAlign: "left", padding: "6px 8px" }}>種別</th>
                      <th style={{ textAlign: "left", padding: "6px 8px" }}>対象日</th>
                      <th style={{ textAlign: "right", padding: "6px 8px" }}>処理数</th>
                      <th style={{ textAlign: "right", padding: "6px 8px" }}>生成数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyItems.map((row) => (
                      <tr key={row.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                        <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{formatLastRun(row.run_at)}</td>
                        <td style={{ padding: "6px 8px" }}>{row.rule_id ? items.find((r) => r.id === row.rule_id)?.title ?? row.rule_id.slice(0, 8) : "ジョブ"}</td>
                        <td style={{ padding: "6px 8px" }}>{row.trigger === "cron" ? "自動" : row.trigger === "manual" ? "手動" : row.trigger === "clear" ? "クリア" : row.trigger}</td>
                        <td style={{ padding: "6px 8px" }}>{row.run_for_date ? row.run_for_date.replace(/-/g, "/") : "—"}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right" }}>{row.processed_count != null ? row.processed_count : "—"}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right" }}>{row.created_count != null ? row.created_count : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {deletingId && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onKeyDown={(e) => e.key === "Escape" && setDeletingId(null)}
        >
          <div style={{ background: "var(--bg-card)", padding: 20, borderRadius: 12, maxWidth: 360 }}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>本当に削除しますか？</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setDeletingId(null)} style={{ padding: "8px 16px", borderRadius: 8, cursor: "pointer" }}>キャンセル</button>
              <button type="button" onClick={confirmDelete} style={{ padding: "8px 16px", borderRadius: 8, cursor: "pointer", background: "var(--color-info)", color: "var(--text-on-primary)" }}>削除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
