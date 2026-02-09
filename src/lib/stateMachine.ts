/**
 * State Machine for context-os
 * Single Source of Truth for status definitions and transitions.
 *
 * Based on:
 *   docs/05_State_Machine.md  — 全15状態の定義・遷移ルール
 *   docs/04_Domain_Model.md   — Node は 1 種類、状態によって役割が変わる
 *   docs/06_Temperature_Spec.md — 状態と温度は別軸
 *   docs/03_Non_Goals.md §2.2 — status を人に選ばせない
 *
 * Architecture principle (10_Architecture.md §3.1):
 *   - AI は状態を「提案」する
 *   - App（このモジュール）が遷移を「検証・確定」する
 *   - 人は「違う」と指摘するだけ
 */

// ─── 全15状態 (05_State_Machine.md §2) ──────────────────────

export const ALL_STATUSES = [
  // A. 入口（発生〜整理）
  "CAPTURED",
  "CLARIFYING",
  "READY",
  // B. 進行（実作業）
  "IN_PROGRESS",
  "DELEGATED",
  "WAITING_EXTERNAL",
  "SCHEDULED",
  // C. 停滞（止まっている理由がある）
  "BLOCKED",
  "NEEDS_DECISION",
  "NEEDS_REVIEW",
  // D. 冷却・再燃
  "COOLING",
  "DORMANT",
  "REACTIVATED",
  // E. 終了
  "DONE",
  "CANCELLED",
] as const;

export type Status = (typeof ALL_STATUSES)[number];

// ─── 日本語ラベル ───────────────────────────────────────────

export const STATUS_LABELS: Record<Status, string> = {
  CAPTURED: "捕捉",
  CLARIFYING: "言語化中",
  READY: "着手可能",
  IN_PROGRESS: "実施中",
  DELEGATED: "委任中",
  WAITING_EXTERNAL: "外部待ち",
  SCHEDULED: "予約済み",
  BLOCKED: "障害あり",
  NEEDS_DECISION: "意思決定待ち",
  NEEDS_REVIEW: "見直し待ち",
  COOLING: "冷却中",
  DORMANT: "休眠",
  REACTIVATED: "再浮上",
  DONE: "完了",
  CANCELLED: "中止",
};

// ─── 遷移ルール (05_State_Machine.md §3) ────────────────────
//
// 原文の遷移概要:
//   CAPTURED → CLARIFYING → READY
//   READY → IN_PROGRESS
//   IN_PROGRESS → DONE / NEEDS_REVIEW / BLOCKED
//   任意 → DELEGATED / WAITING_EXTERNAL
//   任意 → COOLING → DORMANT
//   DORMANT → REACTIVATED → READY / IN_PROGRESS
//   任意 → CANCELLED
//
// 「任意」= 非終了状態からの遷移
// 「詳細な遷移制御は実装に委ねるが、本定義から逸脱してはならない」

export const TRANSITIONS: Record<Status, readonly Status[]> = {
  // A. 入口
  CAPTURED: [
    "CLARIFYING", "READY",
    "DELEGATED", "WAITING_EXTERNAL", "SCHEDULED",
    "COOLING", "CANCELLED",
  ],
  CLARIFYING: [
    "READY", "CAPTURED", "NEEDS_DECISION",
    "DELEGATED", "WAITING_EXTERNAL", "SCHEDULED",
    "COOLING", "CANCELLED",
  ],
  READY: [
    "IN_PROGRESS", "SCHEDULED",
    "DELEGATED", "WAITING_EXTERNAL", "BLOCKED",
    "COOLING", "CANCELLED",
  ],

  // B. 進行
  IN_PROGRESS: [
    "DONE", "NEEDS_REVIEW", "NEEDS_DECISION", "BLOCKED",
    "DELEGATED", "WAITING_EXTERNAL",
    "COOLING", "CANCELLED",
  ],
  DELEGATED: [
    "READY", "IN_PROGRESS", "DONE",
    "WAITING_EXTERNAL",
    "COOLING", "CANCELLED",
  ],
  WAITING_EXTERNAL: [
    "READY", "IN_PROGRESS", "BLOCKED",
    "COOLING", "CANCELLED",
  ],
  SCHEDULED: [
    "READY", "IN_PROGRESS",
    "COOLING", "CANCELLED",
  ],

  // C. 停滞
  BLOCKED: [
    "READY", "IN_PROGRESS", "NEEDS_DECISION",
    "COOLING", "CANCELLED",
  ],
  NEEDS_DECISION: [
    "READY", "IN_PROGRESS", "BLOCKED", "DELEGATED",
    "COOLING", "CANCELLED",
  ],
  NEEDS_REVIEW: [
    "DONE", "IN_PROGRESS", "READY",
    "COOLING", "CANCELLED",
  ],

  // D. 冷却・再燃
  COOLING: ["DORMANT", "REACTIVATED", "CANCELLED"],
  DORMANT: ["REACTIVATED", "CANCELLED"],
  REACTIVATED: ["READY", "IN_PROGRESS", "CLARIFYING", "COOLING", "CANCELLED"],

  // E. 終了（再浮上のみ許可）
  DONE: ["REACTIVATED"],
  CANCELLED: ["REACTIVATED"],
};

// ─── バリデーション ─────────────────────────────────────────

export function isValidStatus(s: unknown): s is Status {
  return typeof s === "string" && (ALL_STATUSES as readonly string[]).includes(s);
}

export function isValidTransition(from: Status, to: Status): boolean {
  if (from === to) return true; // 同じ状態への「遷移」は常に許可（status unchanged）
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function getValidTransitions(from: Status): readonly Status[] {
  return TRANSITIONS[from] ?? [];
}

// ─── アクティブ状態（机の上に載っている Node） ──────────────

export const ACTIVE_STATUSES: readonly Status[] = ALL_STATUSES.filter(
  (s) => s !== "DONE" && s !== "CANCELLED" && s !== "DORMANT"
);

// ─── intent → status 候補の推定 ─────────────────────────────
//
// 05_State_Machine.md §2 の「AI判定の手がかり」をキーワード化。
// MVP はルールベース。将来は LLM (14_Prompt_Pack.md) に委ねる。

const INTENT_PATTERNS: { pattern: RegExp; statuses: Status[] }[] = [
  // 完了系 (DONE)
  { pattern: /完了|終わった|done|できた|完成|片付い/i, statuses: ["DONE"] },
  // 外部待ち系 (WAITING_EXTERNAL)
  { pattern: /待ち|待って|返信|返事|承認|連絡|回答/i, statuses: ["WAITING_EXTERNAL"] },
  // ブロック系 (BLOCKED)
  { pattern: /できない|足りない|障害|止まっ|詰まっ|進めない/i, statuses: ["BLOCKED"] },
  // 判断系 (NEEDS_DECISION)
  { pattern: /判断|決め|どうする|迷っ|選択|決断/i, statuses: ["NEEDS_DECISION"] },
  // レビュー系 (NEEDS_REVIEW)
  { pattern: /確認|レビュー|見直し|チェック|精査/i, statuses: ["NEEDS_REVIEW"] },
  // 委任系 (DELEGATED)
  { pattern: /依頼|任せ|お願い|頼ん|委任|delegate/i, statuses: ["DELEGATED"] },
  // 着手・進行系 (IN_PROGRESS)
  { pattern: /始め|やる|着手|開始|進め|取り掛か|やってる/i, statuses: ["IN_PROGRESS"] },
  // 準備完了系 (READY)
  { pattern: /準備|ready|いつでも|動ける|あとはやるだけ/i, statuses: ["READY"] },
  // 整理・言語化系 (CLARIFYING)
  { pattern: /整理|言語化|まとめ|考え中|検討|何をする/i, statuses: ["CLARIFYING"] },
  // 予約系 (SCHEDULED)
  { pattern: /予定|スケジュール|会議で|日程/i, statuses: ["SCHEDULED"] },
  // 中止系 (CANCELLED)
  { pattern: /やめ|不要|中止|cancel|やらない|取り下げ/i, statuses: ["CANCELLED"] },
  // 再浮上系 (REACTIVATED)
  { pattern: /再開|復活|もう一度|戻す|reactivate/i, statuses: ["REACTIVATED"] },
];

/**
 * intent（自然言語の入力）から status 候補を推定する。
 *
 * 遷移マップに照らして「現在の状態から遷移可能な候補」のみを返す。
 * キーワードにマッチしない場合は suggested: null を返す。
 *
 * @returns suggested: 推定した遷移先（null = 推定不能）、reason: 推定理由
 */
export function estimateStatusFromIntent(
  currentStatus: Status,
  intent: string
): { suggested: Status | null; reason: string } {
  const validNext = getValidTransitions(currentStatus);

  for (const { pattern, statuses } of INTENT_PATTERNS) {
    if (pattern.test(intent)) {
      // マッチした候補のうち、遷移可能なものだけ抽出
      const reachable = statuses.filter((s) => validNext.includes(s));
      if (reachable.length > 0) {
        return {
          suggested: reachable[0],
          reason: `「${intent}」の内容から「${STATUS_LABELS[reachable[0]]}」と推定しました`,
        };
      }
    }
  }

  return { suggested: null, reason: "キーワードから状態を推定できませんでした" };
}
