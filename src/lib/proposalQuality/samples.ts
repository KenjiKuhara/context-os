/**
 * Phase 4: 40_proposal_quality.md §6 のサンプル 10 件（O1〜O5, A1〜A5）に対応するテストデータ。
 */

import type { OrganizerReport, AdvisorReport } from "./types";

// ─── Organizer サンプル（O1〜O5）────────────────────────────────────────

/** O1: アクティブ Node が 0 件 → 空配列 + 非空 summary */
export const ORGANIZER_O1_VALID: OrganizerReport = {
  decomposition_proposals: [],
  grouping_proposals: [],
  relation_proposals: [],
  summary: "机の上に Node がありません。",
};

/** O2: Node 1 件（id: n1）→ summary 存在。decomposition を出す場合は n1, reason, 2+ children */
export const ORGANIZER_O2_VALID: OrganizerReport = {
  decomposition_proposals: [],
  grouping_proposals: [],
  relation_proposals: [],
  summary: "企画書を書く が 1 件あります。",
};

export const ORGANIZER_O2_WITH_DECOMPOSITION: OrganizerReport = {
  decomposition_proposals: [
    {
      target_node_id: "n1",
      target_title: "企画書を書く",
      reason: "内容が複数タスクに分けられそうです。",
      suggested_children: [
        { title: "構成を決める", context: "アウトライン作成" },
        { title: "本文を書く", context: "各セクション執筆" },
      ],
    },
  ],
  grouping_proposals: [],
  relation_proposals: [],
  summary: "企画書を書く を 2 つに分けられそうです。",
};

/** O3: 同一トピック 3 件（n1, n2, n3）→ grouping に reason, summary */
export const ORGANIZER_O3_VALID: OrganizerReport = {
  decomposition_proposals: [],
  grouping_proposals: [
    {
      group_label: "同じプロジェクト",
      reason: "キーワードが共通しており、関連していそうです。",
      node_ids: ["n1", "n2", "n3"],
    },
  ],
  relation_proposals: [],
  summary: "3 件を 1 つのグループにまとめられそうです。",
};

/** O4: Node n1 を分解 → decomposition に n1, 2+ children, reason */
export const ORGANIZER_O4_VALID: OrganizerReport = {
  decomposition_proposals: [
    {
      target_node_id: "n1",
      target_title: "大きなタスク",
      reason: "スコープが大きく、2 つに分けると進めやすそうです。",
      suggested_children: [
        { title: "前半", context: "調査と設計" },
        { title: "後半", context: "実装と確認" },
      ],
    },
  ],
  grouping_proposals: [],
  relation_proposals: [],
  summary: "n1 を 2 つの子に分解できそうです。",
};

/** O5: n1 が n2 に依存 → relation_proposals に from/to/type/reason */
export const ORGANIZER_O5_VALID: OrganizerReport = {
  decomposition_proposals: [],
  grouping_proposals: [],
  relation_proposals: [
    {
      from_node_id: "n1",
      to_node_id: "n2",
      relation_type: "depends_on",
      reason: "n1 が終わらないと n2 に進めなさそうです。",
    },
  ],
  summary: "n1 と n2 の間に依存がありそうです。",
};

/** Organizer の Must を意図的に崩した例（summary 空） */
export const ORGANIZER_INVALID_EMPTY_SUMMARY: OrganizerReport = {
  decomposition_proposals: [],
  grouping_proposals: [],
  relation_proposals: [],
  summary: "",
};

/** Organizer の Must を崩した例（存在しない ID） */
export const ORGANIZER_INVALID_BAD_ID: OrganizerReport = {
  decomposition_proposals: [],
  grouping_proposals: [{ group_label: "X", reason: "理由", node_ids: ["nonexistent"] }],
  relation_proposals: [],
  summary: "要約です。",
};

// ─── Advisor サンプル（A1〜A5）────────────────────────────────────────

/** A1: NEEDS_DECISION の Node n1 → options 2+、各 option に 4 項目 */
export const ADVISOR_A1_VALID: AdvisorReport = {
  target_node_id: "n1",
  target_title: "承認待ちの見積もり",
  current_status: "NEEDS_DECISION",
  options: [
    {
      label: "案A：即決する",
      description: "このまま承認する",
      next_action: "承認ボタンを押し、依頼先に連絡する。",
      necessary_info: "予算枠内かどうか。",
      criteria_note: "スピードを重視する場合。",
      risks: ["後から変更が発生する可能性"],
    },
    {
      label: "案B：保留する",
      description: "追加情報を取ってから決める",
      next_action: "依頼先に確認事項を送り、返答を待つ。",
      necessary_info: "締切と確認に必要な項目。",
      criteria_note: "確実さを重視する場合。",
      risks: ["締切に間に合わない可能性"],
    },
  ],
  criteria: [
    { name: "緊急度", description: "いつまでに決めるか" },
    { name: "確実性", description: "情報の揃い具合" },
  ],
  next_decision: "まず「いつまでに決めるか」を決めると、他が見えてきます。",
  summary: "承認待ちの見積もりで、即決か保留かの選択肢があります。",
};

/** A2: 同 n1、遷移候補あり → options 2+、4 項目 */
export const ADVISOR_A2_VALID: AdvisorReport = {
  ...ADVISOR_A1_VALID,
  options: [
    {
      ...ADVISOR_A1_VALID.options[0],
      suggested_status: "READY",
    },
    {
      ...ADVISOR_A1_VALID.options[1],
      suggested_status: "DONE",
    },
  ],
};

/** A3: 下書き文案 n1 → options 2+（文案パターン）、description, risks */
export const ADVISOR_A3_VALID: AdvisorReport = {
  target_node_id: "n1",
  target_title: "返信文",
  current_status: "IN_PROGRESS",
  options: [
    {
      label: "案A：簡潔な返信",
      description: "了解しました。〇〇で進めます。",
      next_action: "この文案をコピーし、メールに貼り付けて送信する。",
      necessary_info: "宛先と件名。",
      criteria_note: "短く済ませたい場合。",
      risks: ["意図が伝わりにくい場合あり"],
    },
    {
      label: "案B：丁寧な返信",
      description: "お世話になっております。承知しました。〇〇の件、〇〇で進めます。",
      next_action: "この文案を編集し、送信する。",
      necessary_info: "宛先・件名・〇〇の具体文言。",
      criteria_note: "丁寧さを重視する場合。",
      risks: ["文が長くなる"],
    },
  ],
  next_decision: "まず「簡潔に済ませるか、丁寧に書くか」を決めると良いです。",
  summary: "返信文のたたき台が 2 パターンあります。",
};

/** A4: Node 0 件 → 検証では validNodeIds が空のとき target はチェックしない場合、options は 2 以上必須のまま。A4 は「エラーまたは summary のみ」なので、不正な report を送った場合は errors が出る想定。 */
export const ADVISOR_A4_EDGE: AdvisorReport = {
  target_node_id: "",
  target_title: "",
  current_status: "",
  options: [],
  next_decision: "",
  summary: "対象 Node がありません。",
};

/** A5: n1 指定 → target n1、criteria 2+、4 項目 */
export const ADVISOR_A5_VALID: AdvisorReport = {
  ...ADVISOR_A1_VALID,
  target_title: "複数から 1 つ選ぶ対象",
};

/** Advisor の Must を崩した例（options 1 件だけ） */
export const ADVISOR_INVALID_SINGLE_OPTION: AdvisorReport = {
  ...ADVISOR_A1_VALID,
  options: [ADVISOR_A1_VALID.options[0]],
};

/** Advisor の Must を崩した例（risks 空） */
export const ADVISOR_INVALID_NO_RISKS: AdvisorReport = {
  ...ADVISOR_A1_VALID,
  options: ADVISOR_A1_VALID.options.map((o) => ({ ...o, risks: [] as string[] })),
};
