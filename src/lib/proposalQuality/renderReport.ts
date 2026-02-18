/**
 * Phase 4: report を人間が読みやすいテキスト（rendered）に変換する。
 * ok=true のときのみ API で返す。
 */

import type { OrganizerReport, AdvisorReport } from "./types";

export function renderOrganizerReport(report: OrganizerReport): string {
  const lines: string[] = [report.summary, ""];
  if (report.decomposition_proposals.length > 0) {
    lines.push("## 分解案");
    for (const p of report.decomposition_proposals) {
      lines.push(`- **${p.target_title}** (${p.target_node_id}): ${p.reason}`);
      for (const c of p.suggested_children) lines.push(`  - ${c.title}: ${c.context}`);
    }
    lines.push("");
  }
  if (report.grouping_proposals.length > 0) {
    lines.push("## グループ案");
    for (const p of report.grouping_proposals) {
      lines.push(`- **${p.group_label}**: ${p.reason} — ${p.node_ids.join(", ")}`);
    }
    lines.push("");
  }
  if (report.relation_proposals.length > 0) {
    lines.push("## 関連案");
    for (const p of report.relation_proposals) {
      lines.push(`- ${p.from_node_id} → ${p.to_node_id} (${p.relation_type}): ${p.reason}`);
    }
  }
  return lines.join("\n").trim();
}

export function renderAdvisorReport(report: AdvisorReport): string {
  const lines: string[] = [
    `対象Node: ${report.targetNodeId}`,
    `# ${report.target_title} (${report.target_node_id})`,
    `状態: ${report.current_status}`,
    "",
    report.summary,
    "",
    `**まず決めること:** ${report.next_decision}`,
    "",
  ];
  if (report.criteria && report.criteria.length > 0) {
    lines.push("## 比較の観点");
    for (const c of report.criteria) lines.push(`- ${c.name}: ${c.description}`);
    lines.push("");
  }
  lines.push("## 選択肢");
  for (let i = 0; i < report.options.length; i++) {
    const o = report.options[i];
    lines.push(`### ${o.label}`);
    if (o.description) lines.push(o.description);
    lines.push(`- **次の一手:** ${o.next_action}`);
    lines.push(`- **必要情報:** ${o.necessary_info}`);
    lines.push(`- **判断基準:** ${o.criteria_note}`);
    lines.push(`- **リスク:** ${o.risks.join("; ")}`);
    lines.push("");
  }
  return lines.join("\n").trim();
}
