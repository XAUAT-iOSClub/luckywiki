import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/rag/http";
import { RagAuthError } from "@/lib/rag/errors";

export interface RagAuthContext {
  keyId: string | null;
  identity: string;
  hourlyLimit: number;
  keyPrefix: string;
}

export function hashRagKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export async function authenticateRagRequest(
  request: Request,
): Promise<RagAuthContext> {
  if (process.env.RAG_API_ENABLED === "false") {
    throw new RagAuthError("rag_api_disabled", "RAG API is disabled");
  }

  const authorization = request.headers.get("authorization") ?? "";
  const headerKey = request.headers.get("x-rag-key") ?? "";

  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : headerKey.trim();

  if (!token) {
    throw new RagAuthError("missing_token", "Missing API key");
  }

  const ip = getClientIp(request);
  const defaultLimit = Number(process.env.RAG_RATE_LIMIT_PER_HOUR ?? 200);

  // 支持全局环境变量 Key，便于快速测试
  if (process.env.RAG_API_KEY && token === process.env.RAG_API_KEY) {
    return {
      keyId: null,
      identity: `env:${ip}`,
      hourlyLimit: defaultLimit,
      keyPrefix: token.slice(0, 12),
    };
  }

  const key = await prisma.ragApiKey.findUnique({
    where: {
      keyHash: hashRagKey(token),
      status: "ACTIVE",
    },
  });

  if (!key) {
    throw new RagAuthError("invalid_api_key", "Invalid API key");
  }

  // 异步更新最后使用时间，不阻塞主流程
  prisma.ragApiKey
    .update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => undefined);

  return {
    keyId: key.id,
    identity: `key:${key.id}`,
    hourlyLimit: key.hourlyLimit ?? defaultLimit,
    keyPrefix: key.keyPrefix,
  };
}
