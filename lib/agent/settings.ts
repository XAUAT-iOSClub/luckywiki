import { prisma } from "@/lib/prisma";

export type AgentSettings = {
  apiKey: string;
  apiBaseUrl: string;
  chatModel: string;
  embedModel: string;
};

/**
 * 读取 Agent 配置
 * 优先级：数据库 > 环境变量
 */
export async function getAgentSettings(): Promise<AgentSettings> {
  // 先尝试从数据库读
  try {
    const row = await prisma.siteSettings.findUnique({
      where: { id: "default" },
      select: {
        agentApiKey: true,
        agentApiBaseUrl: true,
        agentChatModel: true,
        agentEmbedModel: true,
      },
    });

    if (row) {
      return {
        apiKey: row.agentApiKey ?? process.env.OPENAI_API_KEY ?? "",
        apiBaseUrl:
          row.agentApiBaseUrl ??
          process.env.OPENAI_API_BASE_URL ??
          "https://api.openai.com/v1",
        chatModel:
          row.agentChatModel ??
          process.env.OPENAI_RESPONSES_MODEL ??
          "gpt-4.1-mini",
        embedModel:
          row.agentEmbedModel ??
          process.env.OPENAI_EMBEDDING_MODEL ??
          "text-embedding-3-small",
      };
    }
  } catch {
    // 数据库查询失败，回退到环境变量
  }

  // 环境变量兜底
  return {
    apiKey: process.env.OPENAI_API_KEY ?? "",
    apiBaseUrl: process.env.OPENAI_API_BASE_URL ?? "https://api.openai.com/v1",
    chatModel: process.env.OPENAI_RESPONSES_MODEL ?? "gpt-4.1-mini",
    embedModel: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
  };
}

/**
 * 更新 Agent 配置（写入数据库）
 * 传入 undefined 的字段不修改
 */
export async function updateAgentSettings(settings: {
  apiKey?: string;
  apiBaseUrl?: string;
  chatModel?: string;
  embedModel?: string;
}): Promise<void> {
  const data: Record<string, string> = {};

  if (settings.apiKey !== undefined) data.agentApiKey = settings.apiKey;
  if (settings.apiBaseUrl !== undefined)
    data.agentApiBaseUrl = settings.apiBaseUrl;
  if (settings.chatModel !== undefined)
    data.agentChatModel = settings.chatModel;
  if (settings.embedModel !== undefined)
    data.agentEmbedModel = settings.embedModel;

  if (Object.keys(data).length === 0) return;

  await prisma.siteSettings.upsert({
    where: { id: "default" },
    update: data,
    create: { id: "default", ...data },
  });
}

/**
 * 检查 Agent 是否已配置（有 API Key 就算配置了）
 */
export async function isAgentConfiguredDb(): Promise<boolean> {
  const settings = await getAgentSettings();
  return Boolean(settings.apiKey);
}
