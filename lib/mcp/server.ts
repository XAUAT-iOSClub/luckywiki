import { createMcpError, createMcpResponse, MCP_ERRORS } from "@/lib/mcp/errors";
import { mcpTools, callTool } from "@/lib/mcp/tools";
import { ZodError } from "zod";

/**
 * MCP Server 核心逻辑
 * 实现 MCP 2024-11-05 规范的基础协议
 * Ref: https://spec.modelcontextprotocol.io/specification/2024-11-05/
 */

export type McpRequest = {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

type ServerInfo = {
  name: string;
  version: string;
};

const SERVER_INFO: ServerInfo = {
  name: "luckywiki-mcp",
  version: "1.0.0",
};

const PROTOCOL_VERSION = "2024-11-05";

// 服务器能力声明
const SERVER_CAPABILITIES = {
  tools: {
    listChanged: false, // 目前工具列表是静态的，不发送 list_changed 通知
  },
  // 不声明 logging、resources、prompts 等我们不支持的能力
};

export type SseSendFn = (event: string, data: Record<string, unknown>) => void;

// 自定义 MCP 错误类
class McpError extends Error {
  code: number;
  data?: unknown;

  constructor(error: { code: number; message: string }, data?: unknown) {
    super(error.message);
    this.name = "McpError";
    this.code = error.code;
    this.data = data;
  }
}

/**
 * 处理单个 MCP JSON-RPC 请求
 * SSE 模式下通过 send 回调发送响应
 */
export async function handleMcpRequest(
  request: McpRequest,
  send: SseSendFn,
): Promise<void> {
  const { id, method, params } = request;

  try {
    const result = await dispatchMethod(method, params ?? {}, send);

    // 通知（没有 id 的请求）不需要回复
    if (id === null || id === undefined) return;

    send("message", createMcpResponse(id, result));

    // initialize 完成后发送 initialized 通知（MCP 规范要求）
    if (method === "initialize") {
      // 稍微延迟一下，确保 initialize 响应先到
      setTimeout(() => {
        send("message", {
          jsonrpc: "2.0",
          method: "notifications/initialized",
        });
      }, 0);
    }
  } catch (error) {
    // 通知类请求出错也不回复
    if (id === null || id === undefined) return;

    // Zod 参数校验错误
    if (error instanceof ZodError) {
      send(
        "message",
        createMcpError(id, MCP_ERRORS.INVALID_PARAMS, {
          issues: error.issues,
        }),
      );
      return;
    }

    // 自定义 MCP 错误（带 code）
    if (error instanceof McpError) {
      send(
        "message",
        createMcpError(id, { code: error.code, message: error.message }, error.data),
      );
      return;
    }

    // 普通 Error，不暴露内部堆栈
    if (error instanceof Error) {
      send(
        "message",
        createMcpError(id, MCP_ERRORS.INTERNAL_ERROR, {
          message: error.message,
        }),
      );
      return;
    }

    send("message", createMcpError(id, MCP_ERRORS.INTERNAL_ERROR));
  }
}

/**
 * 处理批量 JSON-RPC 请求（数组形式）
 * 按顺序处理，按顺序返回
 */
export async function handleMcpBatchRequest(
  requests: McpRequest[],
  send: SseSendFn,
): Promise<void> {
  for (const req of requests) {
    await handleMcpRequest(req, send);
  }
}

async function dispatchMethod(
  method: string,
  params: Record<string, unknown>,
  _send: SseSendFn,
): Promise<unknown> {
  switch (method) {
    case "initialize":
      return handleInitialize(params);
    case "tools/list":
      return handleToolsList();
    case "tools/call":
      return handleToolsCall(params);
    case "ping":
      return {};
    default:
      throw new McpError(MCP_ERRORS.METHOD_NOT_FOUND);
  }
}

// ---------- 各方法实现 ----------

function handleInitialize(params: Record<string, unknown>) {
  const clientVersion = params.protocolVersion;
  if (!clientVersion || typeof clientVersion !== "string") {
    throw new McpError(MCP_ERRORS.INVALID_PARAMS, {
      message: "protocolVersion is required",
    });
  }

  // 客户端信息（可选）
  const clientInfo = params.clientInfo
    ? params.clientInfo as Record<string, unknown>
    : undefined;

  // 按规范返回：protocolVersion + capabilities + serverInfo
  return {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: SERVER_CAPABILITIES,
    serverInfo: SERVER_INFO,
    // 额外附带客户端信息的确认，方便调试
    ...(clientInfo ? { _clientInfo: clientInfo } : {}),
  };
}

function handleToolsList() {
  // 直接使用 mcpTools 中定义的标准 inputSchema (JSON Schema 格式)
  const tools = mcpTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));

  return { tools };
}

async function handleToolsCall(params: Record<string, unknown>) {
  const name = params.name;
  const arguments_ = params.arguments ?? {};

  if (typeof name !== "string") {
    throw new McpError(MCP_ERRORS.INVALID_PARAMS, {
      message: "tool name is required",
    });
  }

  // 校验工具是否存在
  const toolExists = mcpTools.some((t) => t.name === name);
  if (!toolExists) {
    throw new McpError(MCP_ERRORS.INVALID_PARAMS, {
      message: `Unknown tool: ${name}`,
    });
  }

  const result = await callTool(name, arguments_);

  // MCP tools/call 标准返回格式
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
    // 结构化数据，方便 LLM 解析
    _raw: result,
  };
}

// ---------- 辅助 ----------

/**
 * 解析 JSON-RPC 请求体
 * 支持单个请求和批量请求（数组）
 */
export function parseMcpRequest(
  body: string,
): McpRequest | McpRequest[] | null {
  try {
    const parsed = JSON.parse(body);

    // 批量请求（数组）
    if (Array.isArray(parsed)) {
      const results = parsed
        .map(validateSingleRequest)
        .filter((r): r is McpRequest => r !== null);
      return results.length > 0 ? results : null;
    }

    // 单个请求
    return validateSingleRequest(parsed);
  } catch {
    return null;
  }
}

function validateSingleRequest(parsed: any): McpRequest | null {
  if (
    parsed.jsonrpc === "2.0" &&
    typeof parsed.method === "string" &&
    (parsed.id === undefined ||
      typeof parsed.id === "string" ||
      typeof parsed.id === "number" ||
      parsed.id === null)
  ) {
    return {
      jsonrpc: "2.0",
      id: parsed.id ?? null,
      method: parsed.method,
      params: parsed.params,
    };
  }
  return null;
}

/**
 * 判断是否为批量请求
 */
export function isBatchRequest(
  req: McpRequest | McpRequest[],
): req is McpRequest[] {
  return Array.isArray(req);
}
