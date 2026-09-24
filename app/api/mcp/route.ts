import { NextRequest } from "next/server";
import {
  handleMcpRequest,
  handleMcpBatchRequest,
  parseMcpRequest,
  isBatchRequest,
  type McpRequest,
} from "@/lib/mcp/server";
import {
  validateMcpApiKey,
  getIdentityKey,
  getIdentityRateLimit,
  type McpIdentity,
} from "@/lib/mcp/auth";
import { checkRateLimit, startRateLimitCleanup } from "@/lib/mcp/rate-limit";
import { createMcpError, MCP_ERRORS } from "@/lib/mcp/errors";
import { incrementKeyUsage, logMcpCall } from "@/lib/mcp/api-keys";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// 启动限流清理定时器（只执行一次）
let cleanupStarted = false;
function ensureCleanup() {
  if (!cleanupStarted) {
    startRateLimitCleanup();
    cleanupStarted = true;
  }
}

// 内存中的 SSE 会话映射（单实例够用，多实例需 Redis Pub/Sub）
type SseSession = {
  send: (event: string, data: Record<string, unknown>, eventId?: string) => void;
  identity: McpIdentity;
  ip: string;
  lastEventId: string;
};
const sseSessions = new Map<string, SseSession>();

// 全局消息序号（用于 SSE id 字段，支持 Last-Event-ID 重连）
let messageCounter = 0;
function nextMessageId(): string {
  messageCounter++;
  return `msg-${messageCounter}`;
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/**
 * 从请求中提取方法名和工具名（用于日志）
 */
function extractMethodInfo(req: McpRequest | McpRequest[]): {
  method: string;
  toolName?: string;
} {
  if (Array.isArray(req)) {
    return { method: `batch(${req.length})` };
  }
  const toolName =
    req.method === "tools/call" &&
    typeof req.params?.name === "string"
      ? req.params.name
      : undefined;
  return { method: req.method, toolName };
}

/**
 * MCP over SSE 端点 — GET 建立 SSE 长连接
 *
 * MCP SSE 规范流程：
 * 1. GET /api/mcp （带 Authorization: Bearer <key>）
 * 2. 服务端返回 SSE 流，首条是 endpoint 事件，包含 POST 地址（带 session token）
 * 3. 客户端通过 POST 到该 endpoint 发送 JSON-RPC 请求
 * 4. 服务端通过 SSE 流返回响应
 *
 * 支持 Last-Event-ID 重连（客户端断连后自动带上最后收到的 id）
 */
export async function GET(request: NextRequest) {
  ensureCleanup();

  // 鉴权
  const identity = await validateMcpApiKey(request);
  if (!identity) {
    return new Response(
      JSON.stringify(createMcpError(null, MCP_ERRORS.UNAUTHORIZED)),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  // 限流检查
  const idKey = getIdentityKey(identity);
  const limit = getIdentityRateLimit(identity);
  if (limit !== null && limit > 0) {
    const rateCheck = checkRateLimit(idKey, limit, 60 * 60 * 1000);
    if (!rateCheck.allowed) {
      return new Response(
        JSON.stringify(
          createMcpError(null, MCP_ERRORS.RATE_LIMITED, {
            resetAt: new Date(rateCheck.resetAt).toISOString(),
          }),
        ),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  const ip = getClientIp(request);
  const sessionId = crypto.randomUUID();
  const lastEventId = request.headers.get("last-event-id") ?? "";

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (event: string, data: Record<string, unknown>, eventId?: string) => {
        const id = eventId ?? nextMessageId();
        const payload = `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
        // 更新会话的 lastEventId
        const session = sseSessions.get(sessionId);
        if (session) session.lastEventId = id;
      };

      // 注册会话
      sseSessions.set(sessionId, { send, identity, ip, lastEventId });

      // 发送 endpoint 事件（MCP SSE 规范要求）
      // 客户端需要 POST 到此 URL 发送请求
      send("endpoint", {
        url: `/api/mcp?sessionId=${sessionId}`,
      });

      // 如果是重连，告知客户端
      if (lastEventId) {
        send("message", {
          jsonrpc: "2.0",
          method: "notifications/reconnected",
          params: {
            lastEventId,
          },
        });
      }

      // 保活心跳（每 30 秒发一个 comment，防止连接超时）
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          clearInterval(heartbeat);
        }
      }, 30000);

      // 客户端断开时清理
      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        sseSessions.delete(sessionId);
        try { controller.close(); } catch {}
      });
    },
    cancel() {
      sseSessions.delete(sessionId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * MCP over SSE 端点 — POST 接收请求
 *
 * 两种模式：
 * 1. SSE 模式（有 sessionId）：通过对应的 SSE 流返回响应，POST 返回 202
 * 2. 直返模式（无 sessionId）：直接在 POST 响应里返回结果（兼容简单客户端）
 *
 * 支持批量请求（JSON-RPC 数组）
 */
export async function POST(request: NextRequest) {
  ensureCleanup();

  const start = Date.now();

  // 鉴权
  const identity = await validateMcpApiKey(request);
  if (!identity) {
    return new Response(
      JSON.stringify(createMcpError(null, MCP_ERRORS.UNAUTHORIZED)),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  // 限流检查
  const idKey = getIdentityKey(identity);
  const limit = getIdentityRateLimit(identity);
  if (limit !== null && limit > 0) {
    const rateCheck = checkRateLimit(idKey, limit, 60 * 60 * 1000);
    if (!rateCheck.allowed) {
      // 记录限流日志
      if (identity.type === "api-key") {
        logMcpCall({
          apiKeyId: identity.keyId,
          userId: identity.userId,
          method: "unknown",
          status: "rate_limited",
          durationMs: Date.now() - start,
          ipAddress: getClientIp(request),
        }).catch(() => {});
      }
      return new Response(
        JSON.stringify(
          createMcpError(null, MCP_ERRORS.RATE_LIMITED, {
            resetAt: new Date(rateCheck.resetAt).toISOString(),
          }),
        ),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  // 解析请求体
  const body = await request.text();
  const mcpRequest = parseMcpRequest(body);

  if (!mcpRequest) {
    return new Response(
      JSON.stringify(createMcpError(null, MCP_ERRORS.PARSE_ERROR)),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // 找 SSE 会话（从 query 参数取 sessionId）
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");
  const session = sessionId ? sseSessions.get(sessionId) : null;

  // 如果有 SSE 会话，通过 SSE 发响应；否则直接在 POST 响应里返回
  let responses: Array<Record<string, unknown>> = [];
  const send = session
    ? session.send
    : (_event: string, data: Record<string, unknown>) => {
        responses.push(data);
      };

  // 提取日志信息
  const { method, toolName } = extractMethodInfo(mcpRequest);

  try {
    // 批量请求 or 单个请求
    if (isBatchRequest(mcpRequest)) {
      await handleMcpBatchRequest(mcpRequest, send);
    } else {
      await handleMcpRequest(mcpRequest, send);
    }

    // 更新使用统计 & 记录日志
    if (identity.type === "api-key") {
      incrementKeyUsage(identity.keyId, true).catch(() => {});
      logMcpCall({
        apiKeyId: identity.keyId,
        userId: identity.userId,
        method,
        toolName,
        status: "success",
        durationMs: Date.now() - start,
        ipAddress: getClientIp(request),
      }).catch(() => {});
    }
  } catch (error) {
    // handleMcpRequest 内部已经处理了错误并通过 send 发出去了
    // 这里记录错误日志
    if (identity.type === "api-key") {
      logMcpCall({
        apiKeyId: identity.keyId,
        userId: identity.userId,
        method,
        toolName,
        status: "error",
        durationMs: Date.now() - start,
        ipAddress: getClientIp(request),
      }).catch(() => {});
    }
  }

  // SSE 模式：返回 202 Accepted
  if (session) {
    return new Response(null, { status: 202 });
  }

  // 直返模式：直接返回结果
  // 批量请求返回数组，单个请求返回单个对象
  const responseBody =
    Array.isArray(mcpRequest) && responses.length > 1
      ? responses
      : responses[0] ?? {};

  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
