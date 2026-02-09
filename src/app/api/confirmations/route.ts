/**
 * POST /api/confirmations
 *
 * Confirmation Object を DB（confirmation_events）に発行する。
 * human_ui が Apply 前に呼び出し、返却された confirmation_id を
 * estimate-status Apply に添付する。
 *
 * Based on:
 *   23_Human_Confirmation_Model.md §2 — Confirmation Object SSOT
 *   23_Human_Confirmation_Model.md §3.2 — 提案→承認の遷移
 *   18_Skill_Governance.md §3 — source + confirmation の二層ガード
 *
 * Request:
 *   { node_id, ui_action, proposed_change: { type, from, to } }
 *
 * Server Responsibility:
 *   - confirmation_id を UUID v4 で生成
 *   - confirmed_by = "human"
 *   - confirmed_at = now()
 *   - expires_at = now() + 24h
 *   - confirmation_events に INSERT
 *
 * Response:
 *   完全な Confirmation Object
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { randomUUID } from "crypto";

const EXPIRY_HOURS = 24;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "invalid JSON" },
        { status: 400 }
      );
    }

    // ── 入力バリデーション ──
    const nodeId =
      typeof body.node_id === "string" ? body.node_id.trim() : "";
    const uiAction =
      typeof body.ui_action === "string" ? body.ui_action.trim() : "";
    const proposedChange = body.proposed_change;

    if (!nodeId) {
      return NextResponse.json(
        { ok: false, error: "node_id is required" },
        { status: 400 }
      );
    }
    if (!uiAction) {
      return NextResponse.json(
        { ok: false, error: "ui_action is required" },
        { status: 400 }
      );
    }
    if (
      !proposedChange ||
      typeof proposedChange !== "object" ||
      typeof proposedChange.type !== "string" ||
      typeof proposedChange.from !== "string" ||
      typeof proposedChange.to !== "string"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "proposed_change is required with { type: string, from: string, to: string }",
        },
        { status: 400 }
      );
    }

    // ── Node の存在確認 ──
    const { data: node, error: nodeErr } = await supabaseAdmin
      .from("nodes")
      .select("id, status")
      .eq("id", nodeId)
      .single();

    if (nodeErr || !node) {
      return NextResponse.json(
        { ok: false, error: "node not found" },
        { status: 404 }
      );
    }

    // proposed_change.from が Node の現在 status と一致するか確認
    if (proposedChange.from !== node.status) {
      return NextResponse.json(
        {
          ok: false,
          error: `proposed_change.from ("${proposedChange.from}") does not match current node status ("${node.status}")`,
        },
        { status: 400 }
      );
    }

    // ── Confirmation を生成 ──
    const now = new Date();
    const expiresAt = new Date(now.getTime() + EXPIRY_HOURS * 60 * 60 * 1000);

    const confirmationId = randomUUID();
    const record = {
      confirmation_id: confirmationId,
      node_id: nodeId,
      confirmed_by: "human",
      confirmed_at: now.toISOString(),
      ui_action: uiAction,
      proposed_change: {
        type: proposedChange.type,
        from: proposedChange.from,
        to: proposedChange.to,
      },
      consumed: false,
      consumed_at: null,
      expires_at: expiresAt.toISOString(),
    };

    const { error: insErr } = await supabaseAdmin
      .from("confirmation_events")
      .insert(record);

    if (insErr) {
      return NextResponse.json(
        { ok: false, error: insErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      confirmation: record,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
