/**
 * MCP HTTP Server Endpoint
 *
 * context-os を MCP (Model Context Protocol) サーバーとして公開する。
 * Claude Code 等の MCP クライアントから HTTP 経由でタスク管理操作を行える。
 *
 * Transport: Streamable HTTP (stateless)
 * 認証: Authorization: Bearer <MCP_TOKEN>
 * ユーザー識別: MCP_USER_ID 環境変数
 *
 * 公開ツール:
 *   - get_dashboard       アクティブタスクをトレー別に取得
 *   - list_nodes          ノード一覧（statusフィルタ可）
 *   - create_node         ノード作成
 *   - update_node         タイトル・コンテキスト・期日を更新
 *   - change_status       ステータス変更（State Machine バリデーション付き）
 *   - get_valid_statuses  次の有効ステータス一覧を取得
 *
 * セキュリティ:
 *   - supabaseAdmin は RLS をバイパスするため、全クエリに .eq("user_id", userId) を付与
 *   - change_status は isValidTransition() でバリデーション後に適用
 *   - node_status_history に source: "mcp" を記録
 */

import { type NextRequest } from "next/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import {
  isValidTransition,
  getValidTransitions,
  isValidStatus,
  ACTIVE_STATUSES,
  STATUS_LABELS,
  type Status,
} from "@/lib/stateMachine";

// ── 認証ヘルパー ──────────────────────────────────────────

function verifyMcpToken(request: Request): boolean {
  const expected = process.env.MCP_TOKEN;
  if (!expected) return false;
  const auth = request.headers.get("authorization");
  if (!auth) return false;
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  return token === expected;
}

function getMcpUserId(): string {
  const userId = process.env.MCP_USER_ID;
  if (!userId) throw new Error("MCP_USER_ID is not configured");
  return userId;
}

// ── McpServer ビルダー ─────────────────────────────────────
// リクエストごとに new して stateless 動作（Next.js サーバーレス環境に適合）

function buildMcpServer(userId: string): McpServer {
  const server = new McpServer({
    name: "context-os",
    version: "1.0.0",
  });

  // ── Tool 1: get_dashboard ─────────────────────────────
  server.registerTool(
    "get_dashboard",
    {
      description:
        "アクティブなタスクをトレー別に取得する（in_progress / needs_decision / waiting_external / cooling / other_active）。現在の作業状況の全体把握に使う。",
    },
    async () => {
      const { data, error } = await supabaseAdmin
        .from("nodes")
        .select("id, title, status, due_date, updated_at, context, temperature")
        .eq("user_id", userId)
        .in("status", [...ACTIVE_STATUSES])
        .order("updated_at", { ascending: false })
        .limit(100);

      if (error) throw new Error(error.message);

      const trays: Record<string, unknown[]> = {
        in_progress: [],
        needs_decision: [],
        waiting_external: [],
        cooling: [],
        other_active: [],
      };
      for (const n of data ?? []) {
        switch (n.status) {
          case "IN_PROGRESS":
            trays.in_progress.push(n);
            break;
          case "NEEDS_DECISION":
            trays.needs_decision.push(n);
            break;
          case "WAITING_EXTERNAL":
            trays.waiting_external.push(n);
            break;
          case "COOLING":
            trays.cooling.push(n);
            break;
          default:
            trays.other_active.push(n);
            break;
        }
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ ok: true, trays }, null, 2),
          },
        ],
      };
    }
  );

  // ── Tool 2: list_nodes ───────────────────────────────
  server.registerTool(
    "list_nodes",
    {
      description:
        "ノード（タスク）一覧を取得する。status フィルタ省略時は全件（最大100件）を返す。",
      inputSchema: {
        status: z
          .string()
          .optional()
          .describe(
            `フィルタするステータス。有効な値: ${Object.keys(STATUS_LABELS).join(", ")}`
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("取得件数の上限（デフォルト: 50）"),
      },
    },
    async ({ status, limit }) => {
      if (status && !isValidStatus(status)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Invalid status: "${status}". 有効な値: ${Object.keys(STATUS_LABELS).join(", ")}`,
            },
          ],
          isError: true,
        };
      }

      let query = supabaseAdmin
        .from("nodes")
        .select("id, title, status, due_date, updated_at, context, temperature")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(limit ?? 50);

      if (status) {
        query = query.eq("status", status);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ ok: true, count: data?.length ?? 0, data: data ?? [] }, null, 2),
          },
        ],
      };
    }
  );

  // ── Tool 3: create_node ──────────────────────────────
  server.registerTool(
    "create_node",
    {
      description: "新しいノード（タスク）を作成する。",
      inputSchema: {
        title: z.string().min(1).describe("タスクのタイトル（必須）"),
        context: z
          .string()
          .optional()
          .describe("詳細・背景・メモ（任意）"),
        due_date: z
          .string()
          .optional()
          .describe("期日（YYYY-MM-DD 形式、任意）"),
        status: z
          .string()
          .optional()
          .describe(
            `初期ステータス（デフォルト: CAPTURED）。有効な値: ${Object.keys(STATUS_LABELS).join(", ")}`
          ),
      },
    },
    async ({ title, context, due_date, status }) => {
      const initialStatus = status ?? "CAPTURED";
      if (!isValidStatus(initialStatus)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Invalid status: "${initialStatus}". 有効な値: ${Object.keys(STATUS_LABELS).join(", ")}`,
            },
          ],
          isError: true,
        };
      }

      const { data, error } = await supabaseAdmin
        .from("nodes")
        .insert({
          user_id: userId,
          title: title.trim(),
          context: context?.trim() ?? null,
          due_date: due_date ?? null,
          status: initialStatus,
          temperature: 50,
          tags: [],
          sibling_order: 0,
        })
        .select("id, title, status, due_date, context, created_at")
        .single();

      if (error) throw new Error(error.message);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ ok: true, data }, null, 2),
          },
        ],
      };
    }
  );

  // ── Tool 4: update_node ──────────────────────────────
  server.registerTool(
    "update_node",
    {
      description:
        "ノードのタイトル・コンテキスト・期日を更新する。ステータス変更は change_status ツールを使うこと。",
      inputSchema: {
        id: z.string().uuid().describe("ノードの UUID"),
        title: z.string().min(1).optional().describe("新しいタイトル"),
        context: z
          .string()
          .optional()
          .describe("新しいコンテキスト（空文字で削除）"),
        due_date: z
          .string()
          .nullable()
          .optional()
          .describe("新しい期日（YYYY-MM-DD または null で削除）"),
      },
    },
    async ({ id, title, context, due_date }) => {
      // 存在確認（user_id フィルタで別ユーザーアクセスを防止）
      const { data: current, error: selErr } = await supabaseAdmin
        .from("nodes")
        .select("id, title, status")
        .eq("id", id)
        .eq("user_id", userId)
        .single();

      if (selErr || !current) {
        return {
          content: [{ type: "text" as const, text: "node not found" }],
          isError: true,
        };
      }

      if (title === undefined && context === undefined && due_date === undefined) {
        return {
          content: [
            {
              type: "text" as const,
              text: "変更するフィールドが指定されていません（title, context, due_date のいずれかを指定してください）",
            },
          ],
          isError: true,
        };
      }

      const update: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (title !== undefined) update.title = title.trim();
      if (context !== undefined) update.context = context || null;
      if (due_date !== undefined) update.due_date = due_date;

      const { error } = await supabaseAdmin
        .from("nodes")
        .update(update)
        .eq("id", id)
        .eq("user_id", userId);

      if (error) throw new Error(error.message);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ ok: true, id, updated: Object.keys(update).filter(k => k !== "updated_at") }),
          },
        ],
      };
    }
  );

  // ── Tool 5: change_status ────────────────────────────
  server.registerTool(
    "change_status",
    {
      description:
        "ノードのステータスを変更する。State Machine バリデーション付き（無効な遷移はエラー）。get_valid_statuses で遷移可能なステータスを確認してから呼ぶこと。",
      inputSchema: {
        id: z.string().uuid().describe("ノードの UUID"),
        to_status: z
          .string()
          .describe(
            `変更先ステータス。有効な値: ${Object.keys(STATUS_LABELS).join(", ")}`
          ),
        reason: z.string().optional().describe("変更理由・メモ（任意）"),
      },
    },
    async ({ id, to_status, reason }) => {
      if (!isValidStatus(to_status)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Invalid status: "${to_status}". 有効な値: ${Object.keys(STATUS_LABELS).map(s => `${s}（${STATUS_LABELS[s as Status]}）`).join(", ")}`,
            },
          ],
          isError: true,
        };
      }

      // 現在のステータス取得（user_id フィルタ）
      const { data: current, error: selErr } = await supabaseAdmin
        .from("nodes")
        .select("id, status, title")
        .eq("id", id)
        .eq("user_id", userId)
        .single();

      if (selErr || !current) {
        return {
          content: [{ type: "text" as const, text: "node not found" }],
          isError: true,
        };
      }

      const fromStatus = current.status as Status;
      const toStatus = to_status as Status;

      // State Machine バリデーション
      if (!isValidTransition(fromStatus, toStatus)) {
        const validTransitions = getValidTransitions(fromStatus).map(
          (s) => `${s}（${STATUS_LABELS[s]}）`
        );
        return {
          content: [
            {
              type: "text" as const,
              text: `遷移 ${fromStatus} → ${toStatus} は許可されていません。\n有効な遷移先: ${validTransitions.join(", ")}`,
            },
          ],
          isError: true,
        };
      }

      const statusChanged = fromStatus !== toStatus;
      const now = new Date().toISOString();

      // ステータス更新（変更がある場合のみ）
      if (statusChanged) {
        const { error: updErr } = await supabaseAdmin
          .from("nodes")
          .update({ status: toStatus, updated_at: now })
          .eq("id", id)
          .eq("user_id", userId);

        if (updErr) throw new Error(updErr.message);
      }

      // node_status_history に記録（source: "mcp"）
      const historyReason = reason ?? `[MCP] ${fromStatus} → ${toStatus}`;
      const { error: histErr } = await supabaseAdmin
        .from("node_status_history")
        .insert({
          node_id: id,
          from_status: fromStatus,
          to_status: toStatus,
          reason: historyReason,
          source: "mcp",
          consumed: true,
          consumed_at: now,
        });

      if (histErr) {
        // 履歴挿入失敗は致命的ではないが警告として返す
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                ok: true,
                from_status: fromStatus,
                to_status: toStatus,
                status_changed: statusChanged,
                warning: `history insert failed: ${histErr.message}`,
              }),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              ok: true,
              id,
              title: current.title,
              from_status: fromStatus,
              to_status: toStatus,
              status_changed: statusChanged,
              from_label: STATUS_LABELS[fromStatus],
              to_label: STATUS_LABELS[toStatus],
            }),
          },
        ],
      };
    }
  );

  // ── Tool 6: get_valid_statuses ───────────────────────
  server.registerTool(
    "get_valid_statuses",
    {
      description:
        "指定ノードの現在ステータスから遷移可能なステータス一覧を取得する。change_status の前に確認するのに便利。",
      inputSchema: {
        id: z.string().uuid().describe("ノードの UUID"),
      },
    },
    async ({ id }) => {
      const { data, error } = await supabaseAdmin
        .from("nodes")
        .select("id, title, status")
        .eq("id", id)
        .eq("user_id", userId)
        .single();

      if (error || !data) {
        return {
          content: [{ type: "text" as const, text: "node not found" }],
          isError: true,
        };
      }

      const currentStatus = data.status as Status;
      const validTransitions = getValidTransitions(currentStatus).map((s) => ({
        status: s,
        label: STATUS_LABELS[s],
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                ok: true,
                id,
                title: data.title,
                current_status: currentStatus,
                current_label: STATUS_LABELS[currentStatus],
                valid_transitions: validTransitions,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  return server;
}

// ── Route Handler ──────────────────────────────────────────

async function handleMcpRequest(request: Request): Promise<Response> {
  // 1. 認証チェック
  if (!verifyMcpToken(request)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2. ユーザー ID 取得
  let userId: string;
  try {
    userId = getMcpUserId();
  } catch {
    return new Response(
      JSON.stringify({ error: "MCP_USER_ID is not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // 3. Stateless トランスポート（リクエストごとに new）
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless モード
    enableJsonResponse: true, // SSE ではなく JSON レスポンスを返す
  });

  const mcpServer = buildMcpServer(userId);
  await mcpServer.connect(transport);

  // 4. MCP プロトコル処理に委譲
  return transport.handleRequest(request);
}

export async function POST(request: NextRequest): Promise<Response> {
  return handleMcpRequest(request);
}

export async function GET(request: NextRequest): Promise<Response> {
  return handleMcpRequest(request);
}

export async function DELETE(request: NextRequest): Promise<Response> {
  return handleMcpRequest(request);
}
