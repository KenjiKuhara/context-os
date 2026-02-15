/**
 * POST /api/proposal-quality/validate
 *
 * Phase 4: OrganizerReport / AdvisorReport の Must/Should 検証を行う。
 * 41_phase4_quality_pipeline.md §6 に準拠。クライアントまたは Orchestrator が
 * AI 出力 JSON を送り、{ ok, errors, warnings } を得る。
 *
 * Body: { type: "organizer" | "advisor", report: object, validNodeIds: string[] }
 * Response: { ok: boolean, errors: string[], warnings: string[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAndUser } from "@/lib/supabase/server";
import { validateOrganizerReport, validateAdvisorReport } from "@/lib/proposalQuality/validator";

export async function POST(req: NextRequest) {
  const { user } = await getSupabaseAndUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "invalid JSON", errors: ["body must be JSON object"], warnings: [] },
        { status: 400 }
      );
    }

    const type = body.type;
    const report = body.report;
    const validNodeIds = Array.isArray(body.validNodeIds) ? body.validNodeIds : [];

    if (type !== "organizer" && type !== "advisor") {
      return NextResponse.json(
        { ok: false, error: "type must be 'organizer' or 'advisor'", errors: [], warnings: [] },
        { status: 400 }
      );
    }

    const result =
      type === "organizer"
        ? validateOrganizerReport(report, validNodeIds)
        : validateAdvisorReport(report, validNodeIds);

    return NextResponse.json({
      ok: result.ok,
      errors: result.errors,
      warnings: result.warnings,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json(
      { ok: false, error: message, errors: [], warnings: [] },
      { status: 500 }
    );
  }
}
