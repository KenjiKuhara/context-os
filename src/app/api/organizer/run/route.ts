/**
 * POST /api/organizer/run
 *
 * Phase 4: Organizer 提案生成 API。
 * 入力: { dashboard, focusNodeId?, userIntent?, constraints? }
 * validNodeIds は dashboard から抽出。LLM → validator → 最大2回再生成 → ok 時のみ rendered を返す。
 *
 * Response: { ok, report, errors, warnings, rendered? }
 */

import { NextRequest, NextResponse } from "next/server";
import { runOrganizerPipeline } from "@/lib/proposalQuality/runPipeline";
import { createServerLogContext } from "@/lib/proposalQuality/runPipelineLog";
import type { RunInputDashboard } from "@/lib/proposalQuality/dashboard";

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
    const focusNodeId = body.focusNodeId ?? null;
    const userIntent = body.userIntent ?? null;
    const constraints = body.constraints ?? null;

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
    } = {
      ok: result.ok,
      report: result.report,
      errors: result.errors,
      warnings: result.warnings,
    };
    if (result.ok && result.rendered) payload.rendered = result.rendered;

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
