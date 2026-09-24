import { prisma } from "@/lib/prisma";

interface RagLogInput {
  keyId: string | null;
  ip: string;
  userAgent: string;
  method: string;
  path: string;
  query: string;
  mode: string;
  topK: number;
  latencyMs: number;
  resultCount: number;
  statusCode: number;
  errorCode: string | null;
}

export async function logRagCall(input: RagLogInput): Promise<void> {
  try {
    await prisma.ragCallLog.create({
      data: {
        keyId: input.keyId,
        ip: input.ip,
        userAgent: input.userAgent.slice(0, 255),
        method: input.method,
        path: input.path,
        query: input.query.slice(0, 200),
        mode: input.mode,
        topK: input.topK,
        latencyMs: input.latencyMs,
        resultCount: input.resultCount,
        statusCode: input.statusCode,
        errorCode: input.errorCode,
      },
    });
  } catch (error) {
    console.error("[rag] failed to write audit log", error);
  }
}
