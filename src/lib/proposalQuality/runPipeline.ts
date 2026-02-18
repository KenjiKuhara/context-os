/**
 * Phase 4: Organizer / Advisor 実行パイプライン（LLM → validate → 最大2回再生成 → render）。
 * validNodeIds は内部で dashboard から抽出する。
 */

import { callLlm, extractJsonFromResponse } from "./llm";
import { extractValidNodeIds, resolveFocusNode, type RunInputDashboard } from "./dashboard";
import { validateOrganizerReport, validateAdvisorReport } from "./validator";
import { buildCorrectionPrompt } from "./selfCorrection";
import { buildOrganizerPrompt, buildAdvisorPrompt } from "./prompts";
import { renderOrganizerReport, renderAdvisorReport } from "./renderReport";
import type { OrganizerReport, AdvisorReport } from "./types";
import type { LogContext } from "./runPipelineLog";

const MAX_RETRIES = 2;

export interface RunPipelineInput {
  dashboard: RunInputDashboard;
  focusNodeId?: string | null;
  userIntent?: string | null;
  constraints?: string | null;
}

export interface RunPipelineResult<T> {
  ok: boolean;
  report: T | null;
  errors: string[];
  warnings: string[];
  rendered?: string;
  /** 再生成を行った回数（0 = 初回で成功） */
  retryCount: number;
}

function parseOrganizerReport(raw: unknown): OrganizerReport | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return {
    decomposition_proposals: Array.isArray(r.decomposition_proposals) ? r.decomposition_proposals as OrganizerReport["decomposition_proposals"] : [],
    grouping_proposals: Array.isArray(r.grouping_proposals) ? r.grouping_proposals as OrganizerReport["grouping_proposals"] : [],
    relation_proposals: Array.isArray(r.relation_proposals) ? r.relation_proposals as OrganizerReport["relation_proposals"] : [],
    summary: typeof r.summary === "string" ? r.summary : "",
  };
}

function parseAdvisorReport(raw: unknown): AdvisorReport | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.options)) return null;
  return {
    targetNodeId: String(r.targetNodeId ?? r.target_node_id ?? ""),
    target_node_id: String(r.target_node_id ?? ""),
    target_title: String(r.target_title ?? ""),
    current_status: String(r.current_status ?? ""),
    options: r.options as AdvisorReport["options"],
    criteria: Array.isArray(r.criteria) ? (r.criteria as AdvisorReport["criteria"]) : undefined,
    next_decision: String(r.next_decision ?? ""),
    summary: String(r.summary ?? ""),
  };
}

/**
 * Organizer を実行。validNodeIds は dashboard から抽出。
 */
export async function runOrganizerPipeline(
  input: RunPipelineInput,
  log: LogContext
): Promise<RunPipelineResult<OrganizerReport>> {
  const validNodeIds = extractValidNodeIds(input.dashboard);
  let lastReport: OrganizerReport | null = null;
  let lastErrors: string[] = [];
  let lastWarnings: string[] = [];
  let retryCount = 0;

  const systemPrompt = "You are Organizer. Output only valid JSON, no other text or markdown.";
  let userPrompt = buildOrganizerPrompt(
    input.dashboard,
    input.userIntent,
    input.constraints,
    input.focusNodeId
  );

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const content = await callLlm([{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }]);
      const raw = extractJsonFromResponse(content);
      lastReport = parseOrganizerReport(raw);
      if (!lastReport) {
        lastErrors = ["Failed to parse OrganizerReport from LLM response"];
        log.logAttempt("organizer", attempt, lastErrors, lastWarnings, false);
        if (attempt < MAX_RETRIES) userPrompt = userPrompt + "\n\n" + buildCorrectionPrompt(lastErrors, validNodeIds);
        retryCount = attempt + 1;
        continue;
      }
      const result = validateOrganizerReport(lastReport, validNodeIds);
      lastErrors = result.errors;
      lastWarnings = result.warnings;
      log.logAttempt("organizer", attempt, result.errors, result.warnings, result.ok);
      if (result.ok) {
        const rendered = renderOrganizerReport(lastReport);
        log.logFinal("organizer", retryCount, true);
        return { ok: true, report: lastReport, errors: [], warnings: result.warnings, rendered, retryCount };
      }
      if (attempt < MAX_RETRIES) {
        userPrompt = userPrompt + "\n\n" + buildCorrectionPrompt(result.errors, validNodeIds);
        retryCount++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      lastErrors = [msg];
      log.logAttempt("organizer", attempt, lastErrors, [], false);
      if (attempt >= MAX_RETRIES) {
        log.logFinal("organizer", retryCount, false);
        return { ok: false, report: null, errors: lastErrors, warnings: [], retryCount: attempt + 1 };
      }
      userPrompt = userPrompt + "\n\n【エラー】" + msg + "\n上記を踏まえ、同じ形式の JSON のみを再出力してください。";
      retryCount++;
    }
  }

  log.logFinal("organizer", retryCount, false);
  return { ok: false, report: lastReport, errors: lastErrors, warnings: lastWarnings, retryCount };
}

/**
 * Advisor を実行。focusNodeId または dashboard から 1 件を対象に。validNodeIds は dashboard から抽出。
 */
export async function runAdvisorPipeline(
  input: RunPipelineInput,
  log: LogContext
): Promise<RunPipelineResult<AdvisorReport>> {
  const validNodeIds = extractValidNodeIds(input.dashboard);
  const focusNode = resolveFocusNode(input.dashboard, input.focusNodeId);
  if (!focusNode) {
    const err = input.focusNodeId
      ? `focusNodeId "${input.focusNodeId}" not found in dashboard`
      : "dashboard has no nodes; set focusNodeId or add nodes";
    log.logAttempt("advisor", 0, [err], [], false);
    log.logFinal("advisor", 0, false);
    return { ok: false, report: null, errors: [err], warnings: [], retryCount: 0 };
  }

  let lastReport: AdvisorReport | null = null;
  let lastErrors: string[] = [];
  let lastWarnings: string[] = [];
  let retryCount = 0;

  const systemPrompt = "You are Advisor. Output only valid JSON, no other text or markdown.";
  let userPrompt = buildAdvisorPrompt(input.dashboard, focusNode, input.userIntent, input.constraints);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const content = await callLlm([{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }]);
      const raw = extractJsonFromResponse(content);
      lastReport = parseAdvisorReport(raw);
      if (!lastReport) {
        lastErrors = ["Failed to parse AdvisorReport from LLM response"];
        log.logAttempt("advisor", attempt, lastErrors, lastWarnings, false);
        if (attempt < MAX_RETRIES) userPrompt = userPrompt + "\n\n" + buildCorrectionPrompt(lastErrors, validNodeIds);
        retryCount = attempt + 1;
        continue;
      }
      lastReport.targetNodeId = focusNode.id;
      const result = validateAdvisorReport(lastReport, validNodeIds);
      lastErrors = result.errors;
      lastWarnings = result.warnings;
      log.logAttempt("advisor", attempt, result.errors, result.warnings, result.ok);
      if (result.ok) {
        const rendered = renderAdvisorReport(lastReport);
        log.logFinal("advisor", retryCount, true);
        return { ok: true, report: lastReport, errors: [], warnings: result.warnings, rendered, retryCount };
      }
      if (attempt < MAX_RETRIES) {
        userPrompt = userPrompt + "\n\n" + buildCorrectionPrompt(result.errors, validNodeIds);
        retryCount++;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      lastErrors = [msg];
      log.logAttempt("advisor", attempt, lastErrors, [], false);
      if (attempt >= MAX_RETRIES) {
        log.logFinal("advisor", retryCount, false);
        return { ok: false, report: null, errors: lastErrors, warnings: [], retryCount: attempt + 1 };
      }
      userPrompt = userPrompt + "\n\n【エラー】" + msg + "\n上記を踏まえ、同じ形式の JSON のみを再出力してください。";
      retryCount++;
    }
  }

  log.logFinal("advisor", retryCount, false);
  return { ok: false, report: lastReport, errors: lastErrors, warnings: lastWarnings, retryCount };
}
