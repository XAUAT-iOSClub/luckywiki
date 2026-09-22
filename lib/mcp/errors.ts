/**
 * MCP 标准错误码
 * Ref: https://spec.modelcontextprotocol.io/specification/2024-11-05/basic/errors/
 */
export const MCP_ERRORS = {
  PARSE_ERROR: { code: -32700, message: "Parse error" },
  INVALID_REQUEST: { code: -32600, message: "Invalid Request" },
  METHOD_NOT_FOUND: { code: -32601, message: "Method not found" },
  INVALID_PARAMS: { code: -32602, message: "Invalid params" },
  INTERNAL_ERROR: { code: -32603, message: "Internal error" },
  NOT_INITIALIZED: { code: -32002, message: "Server not initialized" },
  UNAUTHORIZED: { code: -32001, message: "Unauthorized" },
  RATE_LIMITED: { code: -32000, message: "Rate limit exceeded" },
} as const;

export function createMcpError(
  id: string | number | null,
  error: { code: number; message: string },
  data?: unknown,
) {
  return {
    jsonrpc: "2.0" as const,
    id,
    error: {
      code: error.code,
      message: error.message,
      ...(data !== undefined ? { data } : {}),
    },
  };
}

export function createMcpResponse(id: string | number | null, result: unknown) {
  return {
    jsonrpc: "2.0" as const,
    id,
    result,
  };
}
