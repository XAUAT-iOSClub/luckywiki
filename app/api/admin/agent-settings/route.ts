import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { canAccessAdminShell } from "@/lib/auth/permissions";
import {
  getAgentSettings,
  updateAgentSettings,
} from "@/lib/agent/settings";

export const dynamic = "force-dynamic";

// 获取 Agent 配置
export async function GET() {
  const session = await getCurrentSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canAccessAdminShell(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const settings = await getAgentSettings();
  // 不返回完整的 API key，只返回前几位和后几位
  const maskedKey = settings.apiKey
    ? settings.apiKey.slice(0, 6) + "..." + settings.apiKey.slice(-4)
    : "";

  return NextResponse.json({
    data: {
      apiKeyMasked: maskedKey,
      hasApiKey: Boolean(settings.apiKey),
      apiBaseUrl: settings.apiBaseUrl,
      responsesModel: settings.chatModel,
      embeddingModel: settings.embedModel,
    },
  });
}

// 更新 Agent 配置
export async function POST(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canAccessAdminShell(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const updates: Record<string, string> = {};

    if (body.apiKey !== undefined) {
      if (typeof body.apiKey !== "string") {
        return NextResponse.json(
          { error: "Invalid apiKey" },
          { status: 400 },
        );
      }
      updates.apiKey = body.apiKey.trim();
    }

    if (body.apiBaseUrl !== undefined) {
      if (typeof body.apiBaseUrl !== "string") {
        return NextResponse.json(
          { error: "Invalid apiBaseUrl" },
          { status: 400 },
        );
      }
      updates.apiBaseUrl = body.apiBaseUrl.trim();
    }

    if (body.responsesModel !== undefined) {
      if (typeof body.responsesModel !== "string") {
        return NextResponse.json(
          { error: "Invalid responsesModel" },
          { status: 400 },
        );
      }
      updates.chatModel = body.responsesModel.trim();
    }

    if (body.embeddingModel !== undefined) {
      if (typeof body.embeddingModel !== "string") {
        return NextResponse.json(
          { error: "Invalid embeddingModel" },
          { status: 400 },
        );
      }
      updates.embedModel = body.embeddingModel.trim();
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No updates provided" },
        { status: 400 },
      );
    }

    await updateAgentSettings(updates);

    return NextResponse.json({
      success: true,
      message: "配置已更新，立即生效",
    });
  } catch (error) {
    console.error("[agent-settings] update failed:", error);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 },
    );
  }
}
