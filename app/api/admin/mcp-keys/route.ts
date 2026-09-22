import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { createApiKey, listUserApiKeys, revokeApiKey } from "@/lib/mcp/api-keys";

export const dynamic = "force-dynamic";

// 获取当前用户的所有 MCP API Key
export async function GET() {
  const session = await getCurrentSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const keys = await listUserApiKeys(session.user.id);
  return NextResponse.json({ data: keys });
}

// 创建新的 MCP API Key
export async function POST(request: NextRequest) {
  const session = await getCurrentSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { name, rateLimit } = await request.json();

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  if (name.length > 100) {
    return NextResponse.json({ error: "Name too long" }, { status: 400 });
  }

  if (rateLimit !== undefined && rateLimit !== null) {
    if (typeof rateLimit !== "number" || rateLimit < 0 || rateLimit > 100000) {
      return NextResponse.json({ error: "Invalid rateLimit" }, { status: 400 });
    }
  }

  const result = await createApiKey(session.user.id, name.trim(), rateLimit ?? 200);
  return NextResponse.json({ data: result }, { status: 201 });
}
