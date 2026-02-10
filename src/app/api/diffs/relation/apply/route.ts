/**
 * POST /api/diffs/relation/apply
 *
 * Phase 5-A: relation Diff を 1 件適用する。
 * confirmation_id 必須。confirmation_events の proposed_change (type=relation) を検証し、
 * relations に 1 行 INSERT して confirmation を consumed にする。
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ConfirmationRow {
  confirmation_id: string;
  node_id: string;
  proposed_change: {
    type?: string;
    diff_id?: string;
    from_node_id?: string;
    to_node_id?: string;
    relation_type?: string;
  };
  consumed: boolean;
  consumed_at: string | null;
  expires_at: string;
}

async function consumeConfirmation(confirmationId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabaseAdmin
    .from("confirmation_events")
    .update({
      consumed: true,
      consumed_at: new Date().toISOString(),
    })
    .eq("confirmation_id", confirmationId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "invalid JSON" },
        { status: 400 }
      );
    }

    const confirmationIdRaw =
      typeof body.confirmation_id === "string" ? body.confirmation_id.trim() : "";
    if (!confirmationIdRaw) {
      return NextResponse.json(
        { ok: false, error: "confirmation_id is required" },
        { status: 400 }
      );
    }
    if (!UUID_RE.test(confirmationIdRaw)) {
      return NextResponse.json(
        { ok: false, error: "confirmation_id must be a valid UUID" },
        { status: 400 }
      );
    }

    const { data, error: fetchErr } = await supabaseAdmin
      .from("confirmation_events")
      .select("confirmation_id, node_id, proposed_change, consumed, consumed_at, expires_at")
      .eq("confirmation_id", confirmationIdRaw)
      .single();

    if (fetchErr || !data) {
      return NextResponse.json(
        { ok: false, error: `confirmation not found: ${confirmationIdRaw}` },
        { status: 404 }
      );
    }

    const row = data as ConfirmationRow;
    if (row.consumed) {
      return NextResponse.json(
        { ok: false, error: `confirmation already consumed (at ${row.consumed_at})` },
        { status: 409 }
      );
    }
    if (new Date(row.expires_at) <= new Date()) {
      return NextResponse.json(
        { ok: false, error: `confirmation expired (expires_at: ${row.expires_at})` },
        { status: 403 }
      );
    }

    const pc = row.proposed_change;
    if (!pc || pc.type !== "relation") {
      return NextResponse.json(
        { ok: false, error: "proposed_change must have type 'relation'" },
        { status: 400 }
      );
    }
    const fromNodeId = typeof pc.from_node_id === "string" ? pc.from_node_id.trim() : "";
    const toNodeId = typeof pc.to_node_id === "string" ? pc.to_node_id.trim() : "";
    const relationType = typeof pc.relation_type === "string" ? pc.relation_type.trim() : "";
    if (!fromNodeId || !toNodeId || !relationType) {
      return NextResponse.json(
        { ok: false, error: "proposed_change must include from_node_id, to_node_id, relation_type" },
        { status: 400 }
      );
    }

    const { error: insErr } = await supabaseAdmin.from("relations").insert({
      from_node_id: fromNodeId,
      to_node_id: toNodeId,
      relation_type: relationType,
    });

    if (insErr) {
      if (insErr.code === "23505") {
        return NextResponse.json(
          { ok: false, error: "relation already exists (duplicate from, to, relation_type)" },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { ok: false, error: insErr.message },
        { status: 500 }
      );
    }

    const consumeResult = await consumeConfirmation(confirmationIdRaw);
    if (!consumeResult.ok) {
      console.error("[diffs/relation/apply] consume failed:", consumeResult.error);
    }

    return NextResponse.json({
      ok: true,
      applied: true,
      from_node_id: fromNodeId,
      to_node_id: toNodeId,
      relation_type: relationType,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[diffs/relation/apply] error", message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
