import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { authenticateRagRequest } from "@/lib/rag/auth";
import {
  RagAuthError,
  RagRateLimitError,
  RagValidationError,
} from "@/lib/rag/errors";
import { getClientIp } from "@/lib/rag/http";
import { logRagCall } from "@/lib/rag/logger";
import { checkRagRateLimit } from "@/lib/rag/rate-limit";
import { ragSearchSchema } from "@/lib/rag/schema";
import { buildRagContext, retrieveRagChunks } from "@/lib/rag/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const startedAt = Date.now();

  const ip = getClientIp(request);
  const userAgent = request.headers.get("user-agent") ?? "";

  let keyId: string | null = null;
  let query = "";
  let mode = "auto";
  let topK = 0;
  let resultCount = 0;
  let statusCode = 200;
  let errorCode: string | null = null;

  try {
    const auth = await authenticateRagRequest(request);
    keyId = auth.keyId;

    checkRagRateLimit(auth.identity, auth.hourlyLimit);

    let rawBody: unknown;

    try {
      rawBody = await request.json();
    } catch {
      throw new RagValidationError("invalid_json", "Invalid JSON body");
    }

    let input;

    try {
      input = ragSearchSchema.parse(rawBody);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new RagValidationError(
          "validation_error",
          error.issues[0]?.message ?? "Invalid request",
        );
      }
      throw error;
    }

    query = input.query;
    mode = input.mode;
    topK = input.top_k;

    const results = await retrieveRagChunks(input);
    resultCount = results.length;

    const responsePayload: Record<string, unknown> = {
      query: input.query,
      mode: input.mode,
      top_k: results.length,
      took_ms: Date.now() - startedAt,
      results,
    };

    if (input.include_context) {
      responsePayload.context = buildRagContext(results);
    }

    return NextResponse.json(responsePayload);
  } catch (error) {
    if (error instanceof RagAuthError) {
      statusCode = 401;
      errorCode = error.code;

      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: error.message,
          },
        },
        { status: 401 },
      );
    }

    if (error instanceof RagRateLimitError) {
      statusCode = 429;
      errorCode = "rate_limited";

      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((error.resetAt - Date.now()) / 1000),
      );

      return NextResponse.json(
        {
          error: {
            code: "rate_limited",
            message: "Too many requests",
            retry_after_seconds: retryAfterSeconds,
          },
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfterSeconds),
          },
        },
      );
    }

    if (error instanceof RagValidationError) {
      statusCode = 400;
      errorCode = error.code;

      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: error.message,
          },
        },
        { status: 400 },
      );
    }

    statusCode = 500;
    errorCode = "internal_error";
    console.error("[rag] search failed", error);

    return NextResponse.json(
      {
        error: {
          code: "internal_error",
          message: "Search failed",
        },
      },
      { status: 500 },
    );
  } finally {
    await logRagCall({
      keyId,
      ip,
      userAgent,
      method: "POST",
      path: "/api/v1/rag/search",
      query,
      mode,
      topK,
      latencyMs: Date.now() - startedAt,
      resultCount,
      statusCode,
      errorCode,
    });
  }
}
