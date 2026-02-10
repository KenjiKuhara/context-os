/**
 * Phase 4: Organizer / Advisor 用プロンプト（JSON のみ出力させる）。
 */

import type { RunInputDashboard } from "./dashboard";
import { extractValidNodeIds } from "./dashboard";

function nodesSummary(dashboard: RunInputDashboard): string {
  const ids = extractValidNodeIds(dashboard);
  if (ids.length === 0) return "Node は 0 件です。";
  const trays = dashboard.trays ?? {};
  const parts: string[] = [];
  for (const [trayName, arr] of Object.entries(trays)) {
    if (!Array.isArray(arr)) continue;
    for (const n of arr) {
      if (n?.id) parts.push(`- id: ${n.id}, title: ${String(n.title ?? "")}, status: ${String(n.status ?? "")} (${trayName})`);
    }
  }
  return parts.length ? parts.join("\n") : `Node ID 一覧: ${ids.join(", ")}`;
}

export function buildOrganizerPrompt(
  dashboard: RunInputDashboard,
  userIntent?: string | null,
  constraints?: string | null
): string {
  const nodes = nodesSummary(dashboard);
  const intent = userIntent?.trim() ? `\nユーザーの意図: ${userIntent}` : "";
  const constraint = constraints?.trim() ? `\n制約: ${constraints}` : "";
  return `あなたは Organizer（Level 1）です。Node 群を整理・構造化した提案を、以下の JSON 形式**のみ**で出力してください。余計な説明やマークダウンは付けず、JSON だけを返してください。

## 入力（机の上）
${nodes}
${intent}
${constraint}

## 出力形式（この形の JSON のみ）
{
  "decomposition_proposals": [ { "target_node_id": "", "target_title": "", "reason": "", "suggested_children": [ { "title": "", "context": "" }, ... ] } ],
  "grouping_proposals": [ { "group_label": "", "reason": "", "node_ids": [] } ],
  "relation_proposals": [ { "from_node_id": "", "to_node_id": "", "relation_type": "", "reason": "" } ],
  "summary": ""
}

- すべての node_id は上記「入力」に登場する id のみ使用すること。
- decomposition の suggested_children は 2 件以上。
- 各 proposal に reason を 1 文以上書くこと。
- 「〜べき」「〜してください」は使わないこと。`;
}

export function buildAdvisorPrompt(
  dashboard: RunInputDashboard,
  focusNode: { id: string; title?: string; status?: string },
  userIntent?: string | null,
  constraints?: string | null
): string {
  const nodes = nodesSummary(dashboard);
  const intent = userIntent?.trim() ? `\nユーザーの意図: ${userIntent}` : "";
  const constraint = constraints?.trim() ? `\n制約: ${constraints}` : "";
  return `あなたは Advisor（Level 2）です。対象 Node について選択肢を 2 つ以上、以下の JSON 形式**のみ**で出力してください。余計な説明やマークダウンは付けず、JSON だけを返してください。

## 対象 Node
- id: ${focusNode.id}, title: ${focusNode.title ?? ""}, status: ${focusNode.status ?? ""}

## 入力（机の上）
${nodes}
${intent}
${constraint}

## 出力形式（この形の JSON のみ）
{
  "target_node_id": "${focusNode.id}",
  "target_title": "",
  "current_status": "",
  "options": [
    {
      "label": "案A：...",
      "description": "",
      "next_action": "（この案を選んだ場合の次の一手）",
      "necessary_info": "（選ぶ前に知っておくといい情報）",
      "criteria_note": "（この案を選ぶときの判断基準）",
      "risks": ["（この案のリスクを1件以上）"]
    },
    { ...2件目以上 }
  ],
  "criteria": [ { "name": "", "description": "" } ],
  "next_decision": "まず◯◯を決めると、他が見えてきます。",
  "summary": ""
}

- options は必ず 2 件以上。各 option に next_action, necessary_info, criteria_note, risks（1件以上）を必ず含めること。
- 「ベスト」「推奨」「正解」「〜すべき」は使わないこと。`;
}

