import { createHash, randomBytes, timingSafeEqual as cryptoTimingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

const KEY_PREFIX = "lkw_"; // luckywiki mcp key prefix
const KEY_LENGTH = 32; // 随机部分字节数
const DEFAULT_RATE_LIMIT = 200; // 默认每日 200 次

export type ApiKeyInfo = {
  id: string;
  name: string;
  prefix: string;
  rateLimit: number | null;
  lastUsedAt: Date | null;
  totalCalls: number;
  createdAt: Date;
  revokedAt: Date | null;
};

export type ValidatedApiKey = {
  keyId: string;
  userId: string;
  userRole: string;
  rateLimit: number | null;
};

/**
 * 生成一个新的 API Key
 * 格式：lkw_<random_hex>
 * 只返回一次明文，数据库存 hash
 */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const randomPart = randomBytes(KEY_LENGTH).toString("hex");
  const key = `${KEY_PREFIX}${randomPart}`;
  const prefix = key.slice(0, 10);
  const hash = hashKey(key);
  return { key, prefix, hash };
}

/**
 * 计算 key 的 SHA-256 hash（16 进制）
 */
export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * 恒定时间比较两个 hash，防时序攻击
 */
export function timingSafeEqual(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, "hex");
    const bufB = Buffer.from(b, "hex");
    if (bufA.length !== bufB.length) return false;
    return cryptoTimingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * 创建新的 API Key
 * @returns 明文 key（只返回一次）
 */
export async function createApiKey(
  userId: string,
  name: string,
  rateLimit?: number | null,
): Promise<{ id: string; key: string; prefix: string }> {
  const { key, prefix, hash } = generateApiKey();

  const record = await prisma.mcpApiKey.create({
    data: {
      name,
      keyHash: hash,
      prefix,
      userId,
      rateLimit: rateLimit ?? DEFAULT_RATE_LIMIT,
    },
    select: { id: true, prefix: true },
  });

  return { id: record.id, key, prefix: record.prefix };
}

/**
 * 校验 API Key，返回对应的用户和 key 信息
 */
export async function validateApiKey(key: string): Promise<ValidatedApiKey | null> {
  if (!key || !key.startsWith(KEY_PREFIX)) return null;

  const hash = hashKey(key);

  const record = await prisma.mcpApiKey.findUnique({
    where: { keyHash: hash },
    include: {
      user: { select: { id: true, role: true } },
    },
  });

  if (!record) return null;
  if (record.revokedAt) return null; // 已撤销

  // 恒定时间比较（再保险一层，防止 hash 碰撞概率）
  if (!timingSafeEqual(hash, record.keyHash)) return null;

  return {
    keyId: record.id,
    userId: record.userId,
    userRole: record.user.role,
    rateLimit: record.rateLimit,
  };
}

/**
 * 获取用户的所有 API Key（不含明文）
 */
export async function listUserApiKeys(userId: string): Promise<ApiKeyInfo[]> {
  const records = await prisma.mcpApiKey.findMany({
    where: { userId, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });
  return records.map((r) => ({
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    rateLimit: r.rateLimit,
    lastUsedAt: r.lastUsedAt,
    totalCalls: r.totalCalls,
    createdAt: r.createdAt,
    revokedAt: r.revokedAt,
  }));
}

/**
 * 撤销 API Key（软删除）
 */
export async function revokeApiKey(userId: string, keyId: string): Promise<boolean> {
  const result = await prisma.mcpApiKey.updateMany({
    where: { id: keyId, userId },
    data: { revokedAt: new Date() },
  });
  return result.count > 0;
}

/**
 * 更新 API Key 调用统计（每次调用后调用）
 */
export async function incrementKeyUsage(keyId: string, success: boolean): Promise<void> {
  await prisma.mcpApiKey.update({
    where: { id: keyId },
    data: {
      lastUsedAt: new Date(),
      totalCalls: { increment: 1 },
    },
  });
}

/**
 * 记录一次 MCP 调用日志
 */
export async function logMcpCall(params: {
  apiKeyId: string;
  userId: string;
  method: string;
  toolName?: string;
  status: "success" | "error" | "rate_limited";
  errorCode?: number;
  durationMs: number;
  ipAddress?: string;
}): Promise<void> {
  await prisma.mcpCallLog.create({
    data: params,
  });
}
