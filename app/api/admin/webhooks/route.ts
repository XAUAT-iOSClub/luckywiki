import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { isRootUser } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { WEBHOOK_EVENTS } from "@/lib/webhook/types";

const ALL_EVENTS = new Set<string>(Object.values(WEBHOOK_EVENTS));

function generateSecret(): string {
  return `whsec_${randomBytes(32).toString("hex")}`;
}

/** 只暴露足以识别的前缀，避免短密钥在列表里被完整显示 */
function maskSecretPrefix(secret: string): string {
  const length = Math.max(4, Math.min(12, secret.length - 6));
  return secret.slice(0, length);
}

function validateWebhookInput(body: unknown):
  | { ok: true; value: { name: string; url: string; events: string[]; secret?: string } }
  | { ok: false; error: string } {
  const { name, url, events, secret } = (body ?? {}) as Record<string, unknown>;

  if (typeof name !== "string" || name.trim().length === 0) {
    return { ok: false, error: "Name is required" };
  }
  if (name.length > 100) {
    return { ok: false, error: "Name too long" };
  }
  if (typeof url !== "string" || url.trim().length === 0) {
    return { ok: false, error: "URL is required" };
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, error: "Only http/https URLs are allowed" };
    }
  } catch {
    return { ok: false, error: "Invalid URL" };
  }
  if (
    !Array.isArray(events) ||
    events.length === 0 ||
    events.some((e) => typeof e !== "string" || !ALL_EVENTS.has(e))
  ) {
    return { ok: false, error: "Invalid events" };
  }
  if (secret !== undefined && secret !== null && secret !== "") {
    if (typeof secret !== "string" || secret.length < 8 || secret.length > 200) {
      return { ok: false, error: "Invalid secret (8-200 chars)" };
    }
    return {
      ok: true,
      value: { name: name.trim(), url: url.trim(), events: events as string[], secret },
    };
  }
  return {
    ok: true,
    value: { name: name.trim(), url: url.trim(), events: events as string[] },
  };
}

// GET /api/admin/webhooks — 列出所有 webhook（含最近 5 条投递记录），仅 ROOT
export async function GET() {
  const session = await getCurrentSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isRootUser(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const webhooks = await prisma.webhookConfig.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      deliveryLogs: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          event: true,
          status: true,
          statusCode: true,
          error: true,
          durationMs: true,
          retries: true,
          createdAt: true,
        },
      },
    },
  });

  return NextResponse.json({
    data: webhooks.map((w) => ({
      id: w.id,
      name: w.name,
      url: w.url,
      events: w.events,
      active: w.active,
      secretPrefix: maskSecretPrefix(w.secret),
      lastUsedAt: w.lastUsedAt,
      createdAt: w.createdAt,
      recentDeliveries: w.deliveryLogs,
    })),
  });
}

// POST /api/admin/webhooks — 创建 webhook，仅 ROOT
export async function POST(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isRootUser(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = validateWebhookInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  // 未提供 secret 时自动生成；完整 secret 只在创建响应里返回一次
  const secret = parsed.value.secret ?? generateSecret();

  const webhook = await prisma.webhookConfig.create({
    data: {
      name: parsed.value.name,
      url: parsed.value.url,
      events: parsed.value.events,
      secret,
      userId: session.user.id,
    },
  });

  return NextResponse.json(
    {
      data: {
        id: webhook.id,
        name: webhook.name,
        url: webhook.url,
        events: webhook.events,
        secret,
      },
    },
    { status: 201 },
  );
}
