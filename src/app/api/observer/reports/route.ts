/**
 * POST /api/observer/reports
 *
 * ObserverReport を observer_reports テーブルに保存する。
 * Observer Agent (Python) が observe() 実行後にこの API を呼ぶ。
 *
 * Based on:
 *   19_SubAgent_Observer.md §4.2 — ObserverReport 型
 *   25_Boundary_NextJS_PythonAgent.md §2 — history / レポート保存は Next.js
 *
 * Phase 3-1: Bearer token 認証必須。Authorization: Bearer <OBSERVER_TOKEN>
 *   トークンなし / 形式不正 / 不一致 → 401
 *
 * Request:
 *   {
 *     payload: ObserverReport (JSON),
 *     generated_by?: string,
 *     source_commit?: string,
 *     node_count?: number
 *   }
 *
 * Response:
 *   { ok: true, report_id: string, created_at: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const OBSERVER_SOURCE = "observer_python";

function getBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization");
  if (!auth || typeof auth !== "string") return null;
  const trimmed = auth.trim();
  if (!trimmed.toLowerCase().startsWith("bearer ")) return null;
  return trimmed.slice(7).trim() || null;
}

export async function POST(req: NextRequest) {
  try {
    const expectedToken = process.env.OBSERVER_TOKEN;
    if (!expectedToken || expectedToken.length < 16) {
      return NextResponse.json(
        { ok: false, error: "server misconfiguration: OBSERVER_TOKEN not set" },
        { status: 500 }
      );
    }

    const token = getBearerToken(req);
    if (!token || token !== expectedToken) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "invalid JSON" },
        { status: 400 }
      );
    }

    const payload = body.payload;
    if (!payload || typeof payload !== "object") {
      return NextResponse.json(
        { ok: false, error: "payload (ObserverReport JSON) is required" },
        { status: 400 }
      );
    }

    const receivedAt = new Date().toISOString();

    // 31: payload はそのまま保存する（meta 含む）。meta が無い場合は API 受信時刻で補完し、latest/ダッシュボードで一貫して meta を返す。
    const payloadToStore =
      payload.meta && typeof payload.meta === "object" && (payload.meta as { observed_at?: string }).observed_at
        ? payload
        : {
            ...payload,
            meta: {
              observed_at: receivedAt,
              freshness_minutes: 0,
            },
          };

    const generatedBy =
      typeof body.generated_by === "string"
        ? body.generated_by.trim()
        : "observer_cli";
    const sourceCommit =
      typeof body.source_commit === "string"
        ? body.source_commit.trim()
        : null;
    const nodeCount =
      typeof body.node_count === "number" ? body.node_count : 0;

    const { data, error } = await supabaseAdmin
      .from("observer_reports")
      .insert({
        generated_by: generatedBy,
        payload: payloadToStore,
        source_commit: sourceCommit,
        node_count: nodeCount,
        source: OBSERVER_SOURCE,
        received_at: receivedAt,
      })
      .select("report_id, created_at")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      report_id: data.report_id,
      created_at: data.created_at,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
