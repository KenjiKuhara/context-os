/**
 * POST /api/diffs/decomposition/apply
 *
 * Phase 5-C: decomposition Diff を 1 件適用する。
 * confirmation_id 必須。confirmation_events の proposed_change (type=decomposition) を検証し、
 * nodes に子を N 行 INSERT・node_children に N 行 INSERT して confirmation を consumed にする。
 * 64_phase5_c_decomposition_data_model.md 準拠。
 * 失敗時は consume せず 500 を返す（部分挿入が発生し得るため、厳密なトランザクションが必要なら RPC 化を検討）。
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAndUser } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface AddChild {
  title: string;
  context?: string;
  suggested_status?: string;
}

interface ConfirmationRow {
  confirmation_id: string;
  node_id: string;
  proposed_change: {
    type?: string;
    diff_id?: string;
    parent_node_id?: string;
    add_children?: AddChild[];
  };
  consumed: boolean;
  consumed_at: string | null;
  expires_at: string;
}

async function consumeConfirmation(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").getSupabaseAndUser>>["supabase"],
  confirmationId: string
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
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
  const { supabase, user } = await getSupabaseAndUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
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

    const { data, error: fetchErr } = await supabase
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
    if (!pc || pc.type !== "decomposition") {
      return NextResponse.json(
        { ok: false, error: "proposed_change must have type 'decomposition'" },
        { status: 400 }
      );
    }
    const parentNodeId =
      typeof pc.parent_node_id === "string" ? pc.parent_node_id.trim() : "";
    const addChildren = Array.isArray(pc.add_children) ? pc.add_children : [];
    if (!parentNodeId) {
      return NextResponse.json(
        { ok: false, error: "proposed_change must include parent_node_id" },
        { status: 400 }
      );
    }
    if (addChildren.length < 1) {
      return NextResponse.json(
        { ok: false, error: "proposed_change.add_children must have at least 1 item" },
        { status: 400 }
      );
    }

    const createdChildren: { id: string; title: string }[] = [];

    for (let i = 0; i < addChildren.length; i++) {
      const ch = addChildren[i];
      const title = typeof ch.title === "string" ? ch.title.trim() : "";
      if (!title) {
        return NextResponse.json(
          { ok: false, error: `proposed_change.add_children[${i}].title is required and non-empty` },
          { status: 400 }
        );
      }
      const context =
        typeof ch.context === "string" ? ch.context.trim() : null;
      const status =
        typeof ch.suggested_status === "string" && ch.suggested_status.trim() !== ""
          ? ch.suggested_status.trim()
          : "READY";

      const { data: newNode, error: insErr } = await supabase
        .from("nodes")
        .insert({
          user_id: user.id,
          title,
          context: context || null,
          parent_id: parentNodeId,
          sibling_order: i,
          status,
          temperature: 50,
          tags: [],
        })
        .select("id, title")
        .single();

      if (insErr || !newNode) {
        console.error("[diffs/decomposition/apply] nodes insert error", insErr?.message);
        return NextResponse.json(
          { ok: false, error: insErr?.message ?? "failed to insert node" },
          { status: 500 }
        );
      }

      const childId = (newNode as { id: string; title: string }).id;
      createdChildren.push({ id: childId, title: (newNode as { id: string; title: string }).title });

      const { error: linkErr } = await supabase.from("node_children").insert({
        parent_id: parentNodeId,
        child_id: childId,
      });

      if (linkErr) {
        if (linkErr.code === "23505") {
          return NextResponse.json(
            { ok: false, error: "duplicate parent_id, child_id in node_children" },
            { status: 409 }
          );
        }
        console.error("[diffs/decomposition/apply] node_children insert error", linkErr.message);
        return NextResponse.json(
          { ok: false, error: linkErr.message },
          { status: 500 }
        );
      }
    }

    const consumeResult = await consumeConfirmation(supabase, confirmationIdRaw);
    if (!consumeResult.ok) {
      console.error("[diffs/decomposition/apply] consume failed:", consumeResult.error);
      return NextResponse.json(
        { ok: false, error: consumeResult.error ?? "failed to consume confirmation" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      applied: true,
      parent_node_id: parentNodeId,
      created_children: createdChildren,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[diffs/decomposition/apply] error", message);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
