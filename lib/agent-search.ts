import { ArticleStatus } from "@/generated/prisma/enums";
import { rankChunksBySimilarity } from "@/lib/agent-chunks";
import { embedTexts } from "@/lib/agent-openai";
import { prisma } from "@/lib/prisma";

const minimumRelevantScore = 0.35;

export type AgentSource = {
  path: string;
  title: string;
};

export type RetrievedAgentChunk = AgentSource & {
  heading: string | null;
  content: string;
  score: number;
};

export async function retrieveRelevantAgentChunks(query: string) {
  const [queryEmbedding] = await embedTexts([query]);

  if (!queryEmbedding) {
    return [];
  }

  const chunks = await prisma.agentChunk.findMany({
    include: {
      article: {
        select: {
          path: true,
          title: true,
          status: true,
        },
      },
    },
    where: {
      article: {
        status: ArticleStatus.PUBLISHED,
      },
    },
  });

  const ranked = rankChunksBySimilarity(
    chunks.map((chunk) => ({
      path: chunk.article.path,
      title: chunk.article.title,
      heading: chunk.heading,
      content: chunk.content,
      embedding: safeParseEmbedding(chunk.embedding),
    })),
    queryEmbedding,
  );

  const perArticleLimit = new Map<string, number>();
  const results: RetrievedAgentChunk[] = [];

  for (const chunk of ranked) {
    if (chunk.score < minimumRelevantScore) {
      continue;
    }

    const currentCount = perArticleLimit.get(chunk.path) ?? 0;

    if (currentCount >= 2) {
      continue;
    }

    perArticleLimit.set(chunk.path, currentCount + 1);
    results.push({
      path: chunk.path,
      title: chunk.title,
      heading: chunk.heading,
      content: chunk.content,
      score: chunk.score,
    });

    if (results.length >= 6) {
      break;
    }
  }

  return results;
}

export async function findSuggestedAgentSources(query: string) {
  const normalized = query.trim();

  if (!normalized) {
    return [];
  }

  const suggestions = await prisma.article.findMany({
    where: {
      status: ArticleStatus.PUBLISHED,
      OR: [
        {
          title: {
            contains: normalized,
            mode: "insensitive",
          },
        },
        {
          path: {
            contains: normalized,
            mode: "insensitive",
          },
        },
      ],
    },
    select: {
      path: true,
      title: true,
    },
    orderBy: {
      updatedAt: "desc",
    },
    take: 3,
  });

  return suggestions;
}

function safeParseEmbedding(embedding: string) {
  try {
    const value = JSON.parse(embedding) as number[];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}
