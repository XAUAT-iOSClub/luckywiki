import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { isRootUser } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";
import { WEBHOOK_EVENTS } from "@/lib/webhook/types";

const ALL_EVENTS = new Set<string>(Object.values(WEBHOOK_EVENTS));

// PATCH /api/admin/webhooks/[id] — 更新 name/url/events/active，仅 ROOT
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getCurrentSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isRootUser(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { name, url, events, active } = (body ?? {}) as Record<string, unknown>;

  const data: { name?: string; url?: string; events?: string[]; active?: boolean } = {};

  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length === 0 || name.length > 100) {
      return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    }
    data.name = name.trim();
  }
  if (url !== undefined) {
    if (typeof url !== "string") {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return NextResponse.json({ error: "Only http/https URLs are allowed" }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }
    data.url = url.trim();
  }
  if (events !== undefined) {
    if (
      !Array.isArray(events) ||
      events.length === 0 ||
      events.some((e) => typeof e !== "string" || !ALL_EVENTS.has(e))
    ) {
      return NextResponse.json({ error: "Invalid events" }, { status: 400 });
    }
    data.events = events as string[];
  }
  if (active !== undefined) {
    if (typeof active !== "boolean") {
      return NextResponse.json({ error: "Invalid active" }, { status: 400 });
    }
    data.active = active;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  try {
    const webhook = await prisma.webhookConfig.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        url: true,
        events: true,
        active: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ data: webhook });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("[api/admin/webhooks PATCH]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE /api/admin/webhooks/[id] — 删除 webhook（投递日志级联删除），仅 ROOT
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getCurrentSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isRootUser(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  try {
    await prisma.webhookConfig.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2025") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("[api/admin/webhooks DELETE]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
