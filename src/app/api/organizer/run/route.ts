/**
 * POST /api/organizer/run
 *
 * Phase 4: Organizer 提案生成 API。
 * Phase 5-A/5-B/5-C: ok 時は diffs（relation + grouping + decomposition、VALID/NEEDS_REVIEW のみ）をレスポンスに追加。
 *
 * Response: { ok, report, errors, warnings, rendered?, diffs? }
 */

import { NextRequest, NextResponse } from "next/server";
import { runOrganizerPipeline } from "@/lib/proposalQuality/runPipeline";
import { createServerLogContext } from "@/lib/proposalQuality/runPipelineLog";
import { extractValidNodeIds, type RunInputDashboard } from "@/lib/proposalQuality/dashboard";
import { transformOrganizerReportToDiffs } from "@/lib/phase5Diff/transform";
import { validateDiff } from "@/lib/phase5Diff/validator";
import type { Diff, DiffValidationOutput } from "@/lib/phase5Diff/types";
import type { OrganizerReport } from "@/lib/proposalQuality/types";

export type OrganizerDiffItem = Diff & { validation?: DiffValidationOutput };

function isDashboardLike(body: unknown): body is { dashboard: RunInputDashboard } {
  return (
    body != null &&
    typeof body === "object" &&
    "dashboard" in body &&
    (body as Record<string, unknown>).dashboard != null &&
    typeof (body as Record<string, unknown>).dashboard === "object"
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!isDashboardLike(body)) {
      return NextResponse.json(
        {
          ok: false,
          report: null,
          errors: ["dashboard is required (object with trays)"],
          warnings: [],
        },
        { status: 400 }
      );
    }

    const dashboard = body.dashboard as RunInputDashboard;
    const b = body as { dashboard: RunInputDashboard; focusNodeId?: string; userIntent?: string; constraints?: string };
    const focusNodeId = b.focusNodeId ?? null;
    const userIntent = b.userIntent ?? null;
    const constraints = b.constraints ?? null;

    const log = createServerLogContext();
    const result = await runOrganizerPipeline(
      { dashboard, focusNodeId, userIntent, constraints },
      log
    );

    const payload: {
      ok: boolean;
      report: typeof result.report;
      errors: string[];
      warnings: string[];
      rendered?: string;
      diffs?: OrganizerDiffItem[];
    } = {
      ok: result.ok,
      report: result.report,
      errors: result.errors,
      warnings: result.warnings,
    };
    if (result.ok && result.rendered) payload.rendered = result.rendered;

    if (result.ok && result.report) {
      const validNodeIds = extractValidNodeIds(dashboard);
      const runId = `organizer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const { diffs: rawDiffs, warnings: transformWarnings } = transformOrganizerReportToDiffs(
        result.report as OrganizerReport,
        { organizer_run_id: runId, attempt_id: result.retryCount ?? 0, validNodeIds }
      );
      const diffs: OrganizerDiffItem[] = [];
      for (const d of rawDiffs) {
        const validation = validateDiff(d, { validNodeIds });
        if (validation.result !== "INVALID") {
          diffs.push({ ...d, validation });
        }
      }
      payload.diffs = diffs;
    }

    return NextResponse.json(payload);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[organizer/run] error", message);
    return NextResponse.json(
      {
        ok: false,
        report: null,
        errors: [message],
        warnings: [],
      },
      { status: 500 }
    );
  }
}
