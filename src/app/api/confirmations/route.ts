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

    if (!uiAction) {
      return NextResponse.json(
        { ok: false, error: "ui_action is required" },
        { status: 400 }
      );
    }
    if (!proposedChange || typeof proposedChange !== "object" || typeof proposedChange.type !== "string") {
      return NextResponse.json(
        { ok: false, error: "proposed_change is required with { type: string, ... }" },
        { status: 400 }
      );
    }

    const changeType = proposedChange.type as string;
    /** Phase8-B: 任意の理由。relation / grouping / decomposition の proposed_change に含める */
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    if (changeType !== "relation" && changeType !== "grouping" && changeType !== "decomposition" && !nodeId) {
      return NextResponse.json(
        { ok: false, error: "node_id is required for status_change and other non-Diff proposed_change" },
        { status: 400 }
      );
    }

    if (changeType === "decomposition") {
      // Phase 5-C: decomposition Diff 用
      const diffId = typeof proposedChange.diff_id === "string" ? proposedChange.diff_id.trim() : "";
      const parentNodeId =
        typeof proposedChange.parent_node_id === "string" ? proposedChange.parent_node_id.trim() : "";
      const rawChildren = Array.isArray(proposedChange.children)
        ? proposedChange.children
        : Array.isArray(proposedChange.add_children)
          ? proposedChange.add_children
          : [];
      if (!diffId || !parentNodeId || rawChildren.length < 1) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "proposed_change (type=decomposition) requires diff_id, parent_node_id, children (array, 1+ items)",
          },
          { status: 400 }
        );
      }
      const { data: parentNode } = await supabaseAdmin
        .from("nodes")
        .select("id")
        .eq("id", parentNodeId)
        .single();
      if (!parentNode) {
        return NextResponse.json(
          { ok: false, error: `parent_node_id not found in nodes: ${parentNodeId}` },
          { status: 404 }
        );
      }
      const add_children: { title: string; context?: string; suggested_status?: string }[] = [];
      for (let i = 0; i < rawChildren.length; i++) {
        const item = rawChildren[i];
        if (!item || typeof item !== "object") {
          return NextResponse.json(
            { ok: false, error: `proposed_change.children[${i}] must be an object with title` },
            { status: 400 }
          );
        }
        const title = typeof item.title === "string" ? item.title.trim() : "";
        if (!title) {
          return NextResponse.json(
            { ok: false, error: `proposed_change.children[${i}].title is required and must be non-empty` },
            { status: 400 }
          );
        }
        const context =
          typeof item.context === "string" ? item.context.trim() : undefined;
        const suggested_status =
          typeof item.suggested_status === "string" && item.suggested_status.trim() !== ""
            ? item.suggested_status.trim()
            : undefined;
        add_children.push({
          title,
          ...(context !== undefined && { context }),
          ...(suggested_status !== undefined && { suggested_status }),
        });
      }
      const now = new Date();
      const expiresAt = new Date(now.getTime() + EXPIRY_HOURS * 60 * 60 * 1000);
      const confirmationId = randomUUID();
      const record = {
        confirmation_id: confirmationId,
        node_id: parentNodeId,
        confirmed_by: "human",
        confirmed_at: now.toISOString(),
        ui_action: uiAction,
        proposed_change: {
          type: "decomposition",
          diff_id: diffId,
          parent_node_id: parentNodeId,
          add_children,
          reason,
        },
        consumed: false,
        consumed_at: null,
        expires_at: expiresAt.toISOString(),
      };
      const { error: insErr } = await supabaseAdmin.from("confirmation_events").insert(record);
      if (insErr) {
        return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, confirmation: record });
    }

    if (changeType === "grouping") {
      // Phase 5-B: grouping Diff 用
      const diffId = typeof proposedChange.diff_id === "string" ? proposedChange.diff_id.trim() : "";
      const groupLabel = typeof proposedChange.group_label === "string" ? proposedChange.group_label.trim() : "";
      const rawNodeIds = Array.isArray(proposedChange.node_ids) ? proposedChange.node_ids : [];
      const nodeIds = rawNodeIds
        .filter((id: unknown): id is string => typeof id === "string" && id.trim() !== "")
        .map((id: string) => id.trim());
      if (!diffId || !groupLabel || nodeIds.length < 2) {
        return NextResponse.json(
          { ok: false, error: "proposed_change (type=grouping) requires diff_id, group_label, node_ids (array, 2+ items)" },
          { status: 400 }
        );
      }
      for (const nid of nodeIds) {
        const { data: node } = await supabaseAdmin.from("nodes").select("id").eq("id", nid).single();
        if (!node) {
          return NextResponse.json(
            { ok: false, error: `node_id not found in nodes: ${nid}` },
            { status: 404 }
          );
        }
      }
      const now = new Date();
      const expiresAt = new Date(now.getTime() + EXPIRY_HOURS * 60 * 60 * 1000);
      const confirmationId = randomUUID();
      const record = {
        confirmation_id: confirmationId,
        node_id: nodeIds[0],
        confirmed_by: "human",
        confirmed_at: now.toISOString(),
        ui_action: uiAction,
        proposed_change: {
          type: "grouping",
          diff_id: diffId,
          group_label: groupLabel,
          node_ids: nodeIds,
          reason,
        },
        consumed: false,
        consumed_at: null,
        expires_at: expiresAt.toISOString(),
      };
      const { error: insErr } = await supabaseAdmin.from("confirmation_events").insert(record);
      if (insErr) {
        return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, confirmation: record });
    }

    if (changeType === "relation") {
      // Phase 5-A: relation Diff 用
      const diffId = typeof proposedChange.diff_id === "string" ? proposedChange.diff_id.trim() : "";
      const fromNodeId = typeof proposedChange.from_node_id === "string" ? proposedChange.from_node_id.trim() : "";
      const toNodeId = typeof proposedChange.to_node_id === "string" ? proposedChange.to_node_id.trim() : "";
      const relationType = typeof proposedChange.relation_type === "string" ? proposedChange.relation_type.trim() : "";
      if (!diffId || !fromNodeId || !toNodeId || !relationType) {
        return NextResponse.json(
          { ok: false, error: "proposed_change (type=relation) requires diff_id, from_node_id, to_node_id, relation_type" },
          { status: 400 }
        );
      }
      const { data: fromNode } = await supabaseAdmin.from("nodes").select("id").eq("id", fromNodeId).single();
      const { data: toNode } = await supabaseAdmin.from("nodes").select("id").eq("id", toNodeId).single();
      if (!fromNode || !toNode) {
        return NextResponse.json(
          { ok: false, error: "from_node_id or to_node_id not found in nodes" },
          { status: 404 }
        );
      }
      const now = new Date();
      const expiresAt = new Date(now.getTime() + EXPIRY_HOURS * 60 * 60 * 1000);
      const confirmationId = randomUUID();
      const record = {
        confirmation_id: confirmationId,
        node_id: fromNodeId,
        confirmed_by: "human",
        confirmed_at: now.toISOString(),
        ui_action: uiAction,
        proposed_change: {
          type: "relation",
          diff_id: diffId,
          from_node_id: fromNodeId,
          to_node_id: toNodeId,
          relation_type: relationType,
          reason,
        },
        consumed: false,
        consumed_at: null,
        expires_at: expiresAt.toISOString(),
      };
      const { error: insErr } = await supabaseAdmin.from("confirmation_events").insert(record);
      if (insErr) {
        return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, confirmation: record });
    }

    // status_change（既存）
    if (
      typeof proposedChange.from !== "string" ||
      typeof proposedChange.to !== "string"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "proposed_change (status_change) requires { type, from: string, to: string }",
        },
        { status: 400 }
      );
    }

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

    if (proposedChange.from !== node.status) {
      return NextResponse.json(
        {
          ok: false,
          error: `proposed_change.from ("${proposedChange.from}") does not match current node status ("${node.status}")`,
        },
        { status: 400 }
      );
    }

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
