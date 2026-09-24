import { NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { validateApiKey } from "./api-keys";

export type McpIdentity = {
  type: "api-key";
  keyId: string;
  userId: string;
  userRole: string;
  rateLimit: number | null;
} | {
  type: "global-key"; // 环境变量全局 key
  rateLimit: number | null;
};

/**
 * 从请求中提取 Bearer Token
 */
export function extractBearerToken(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

/**
 * 校验全局 API Key（环境变量 MCP_SERVER_API_KEY）
 */
function validateGlobalKey(token: string): boolean {
  const globalKey = process.env.MCP_SERVER_API_KEY;
  if (!globalKey) return false;
  try {
    const a = Buffer.from(createHash("sha256").update(token).digest("hex"), "hex");
    const b = Buffer.from(createHash("sha256").update(globalKey).digest("hex"), "hex");
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * 校验 MCP API Key
 * 优先级：数据库用户级 Key > 环境变量全局 Key
 */
export async function validateMcpApiKey(request: NextRequest): Promise<McpIdentity | null> {
  const token = extractBearerToken(request);
  if (!token) return null;

  // 1. 先查数据库里的用户级 Key
  const dbKey = await validateApiKey(token);
  if (dbKey) {
    return {
      type: "api-key",
      keyId: dbKey.keyId,
      userId: dbKey.userId,
      userRole: dbKey.userRole,
      rateLimit: dbKey.rateLimit,
    };
  }

  // 2. 回退到环境变量全局 Key（开发/内部调用用）
  if (validateGlobalKey(token)) {
    const limit = process.env.MCP_RATE_LIMIT
      ? parseInt(process.env.MCP_RATE_LIMIT, 10)
      : null;
    return {
      type: "global-key",
      rateLimit: limit,
    };
  }

  return null;
}

/**
 * 获取调用者身份标识（用于限流 key）
 */
export function getIdentityKey(identity: McpIdentity): string {
  if (identity.type === "api-key") return `key:${identity.keyId}`;
  return "global";
}

/**
 * 获取调用者的限流配额（null = 不限制）
 */
export function getIdentityRateLimit(identity: McpIdentity): number | null {
  return identity.rateLimit;
}
