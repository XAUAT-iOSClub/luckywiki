import { ArticleStatus } from "@/generated/prisma/enums";
import { rankChunksBySimilarity } from "@/lib/agent/chunks";
import { embedTexts } from "@/lib/agent/openai";
import { prisma } from "@/lib/prisma";
import type { RetrievedAgentChunk } from "@/types/agent";

const minimumRelevantScore = 0.35;

/** Chat retrieval should never hold the first token hostage to a slow gateway. */
const defaultRetrievalTimeoutMs = 3_500;
const lexicalTimeoutMs = 3_500;
/** ParadeDB BM25 scores above this are precise enough to answer without ANN. */
const strongLexicalScore = 20;
const strongSemanticScore = 0.7;
const minimumLexicalFusionScore = 15;
const semanticTimeoutMs = 2_000;
const queryEmbeddingCacheTtlMs = 5 * 60_000;
const queryEmbeddingCacheLimit = 128;
const retrievalCacheTtlMs = 60_000;
const retrievalCacheLimit = 64;

type RetrieveRelevantChunksOptions = {
  signal?: AbortSignal;
};

type SemanticRow = {
  id: string;
  path: string;
  title: string;
  heading: string | null;
  content: string;
  score: number;
};

type LexicalRow = {
  id: string;
  path: string;
  title: string;
  heading: string | null;
  content: string;
  score: number;
};

type LexicalCandidate = LexicalRow & {
  bm25Score: number;
};

type SqlChunk = RetrievedAgentChunk & {
  id: string;
  semanticScore: number;
  lexicalRank: number | null;
};

const queryEmbeddingCache = new Map<
  string,
  { embedding: number[]; expiresAt: number }
>();

const retrievalCache = new Map<
  string,
  { chunks: RetrievedAgentChunk[]; expiresAt: number }
>();

export async function retrieveRelevantAgentChunks(
  query: string,
  options: RetrieveRelevantChunksOptions = {},
) {
  if (options.signal?.aborted) {
    return [];
  }

  const cacheKey = query.trim();
  const cached = retrievalCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    retrievalCache.delete(cacheKey);
    retrievalCache.set(cacheKey, cached);
    return cached.chunks;
  }

  const chunks = await computeRelevantAgentChunks(query, options);

  if (chunks.length > 0 && !options.signal?.aborted) {
    retrievalCache.set(cacheKey, {
      chunks,
      expiresAt: Date.now() + retrievalCacheTtlMs,
    });

    while (retrievalCache.size > retrievalCacheLimit) {
      const oldestKey = retrievalCache.keys().next().value;

      if (oldestKey === undefined) {
        break;
      }

      retrievalCache.delete(oldestKey);
    }
  }

  return chunks;
}

async function computeRelevantAgentChunks(
  query: string,
  options: RetrieveRelevantChunksOptions,
) {
  // BM25 is cheap and precise for keyword-rich questions, while the embedding
  // gateway can take seconds. Start both, and if BM25 is already confident we
  // cancel the embedding request instead of waiting for it.
  const embeddingAbort = new AbortController();
  const embeddingSignal = options.signal
    ? AbortSignal.any([options.signal, embeddingAbort.signal])
    : embeddingAbort.signal;
  const embeddingPromise = getQueryEmbedding(query, embeddingSignal).catch(
    () => undefined,
  );

  const lexicalCandidates = await withTimeout(
    retrieveLexicalCandidates(query),
    lexicalTimeoutMs,
    [] as LexicalCandidate[],
  );

  if (options.signal?.aborted) {
    embeddingAbort.abort();
    return [];
  }

  if (isStrongLexicalMatch(lexicalCandidates)) {
    embeddingAbort.abort();
    return limitRetrievedChunks(toRetrievedChunks(lexicalCandidates));
  }

  const [queryEmbedding] = (await embeddingPromise) ?? [];

  if (!queryEmbedding) {
    return limitRetrievedChunks(toRetrievedChunks(lexicalCandidates));
  }

  const sqlResults = await retrieveWithParadeDb(
    queryEmbedding,
    lexicalCandidates,
  );

  if (sqlResults) {
    const hasRelevantSemantic = sqlResults.some(
      (chunk) => chunk.score >= minimumRelevantScore,
    );
    return limitRetrievedChunks(sqlResults, !hasRelevantSemantic);
  }

  if (lexicalCandidates.length > 0) {
    return limitRetrievedChunks(toRetrievedChunks(lexicalCandidates));
  }

  const chunks = await prisma.$queryRaw<Array<{
    path: string;
    title: string;
    heading: string | null;
    content: string;
    embedding: string;
  }>>`
    SELECT a.path, a.title, c.heading, c.content, c.embedding::text AS embedding
    FROM agent_chunks c
    JOIN articles a ON a.id = c.article_id
    WHERE a.status = 'PUBLISHED'
  `;

  const ranked = rankChunksBySimilarity(
    chunks.map((chunk) => ({
      path: chunk.path,
      title: chunk.title,
      heading: chunk.heading,
      content: chunk.content,
      embedding: safeParseEmbedding(chunk.embedding),
    })),
    queryEmbedding,
  );

  return limitRetrievedChunks(
    ranked.map((chunk) => ({
      path: chunk.path,
      title: chunk.title,
      heading: chunk.heading,
      content: chunk.content,
      score: chunk.score,
    })),
  );
}

async function getQueryEmbedding(query: string, signal?: AbortSignal) {
  const normalized = query.trim();
  const cacheKey = `${process.env.OPENAI_EMBEDDING_MODEL ?? "default"}:${normalized}`;
  const cached = queryEmbeddingCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    // Refresh insertion order so the bounded cache evicts the oldest entry.
    queryEmbeddingCache.delete(cacheKey);
    queryEmbeddingCache.set(cacheKey, cached);
    return [cached.embedding];
  }

  const timeout = AbortSignal.timeout(getRetrievalTimeoutMs());
  const requestSignal = signal
    ? AbortSignal.any([signal, timeout])
    : timeout;
  const [embedding] = await embedTexts([normalized], requestSignal);

  if (embedding) {
    queryEmbeddingCache.set(cacheKey, {
      embedding,
      expiresAt: Date.now() + queryEmbeddingCacheTtlMs,
    });

    while (queryEmbeddingCache.size > queryEmbeddingCacheLimit) {
      const oldestKey = queryEmbeddingCache.keys().next().value;

      if (oldestKey === undefined) {
        break;
      }

      queryEmbeddingCache.delete(oldestKey);
    }
  }

  return [embedding];
}

async function retrieveLexicalCandidates(
  query: string,
): Promise<LexicalCandidate[]> {
  const lexicalQuery = buildLexicalQuery(query);

  if (!lexicalQuery) {
    return [];
  }

  try {
    const rows = await prisma.$queryRaw<LexicalRow[]>`
      SELECT c.id, a.path, a.title, c.heading, c.content,
        paradedb.score(c.id) AS score
      FROM agent_chunks c
      JOIN articles a ON a.id = c.article_id
      WHERE a.status = 'PUBLISHED'
        AND (c.content @@@ ${lexicalQuery} OR c.heading @@@ ${lexicalQuery})
      ORDER BY paradedb.score(c.id) DESC
      LIMIT 24
    `;

    return rows.map((row) => ({
      ...row,
      bm25Score: Number(row.score),
    }));
  } catch (error) {
    console.warn("[agent] lexical retrieval unavailable", error);
    return [];
  }
}

/** Fuse ANN candidates with BM25 ranks when ANN alone is not confident. */
async function retrieveWithParadeDb(
  queryEmbedding: number[],
  lexicalCandidates: LexicalCandidate[],
): Promise<RetrievedAgentChunk[] | null> {
  try {
    const vector = JSON.stringify(queryEmbedding);
    const semantic = await withTimeout(
      prisma.$queryRaw<SemanticRow[]>`
        SELECT c.id, a.path, a.title, c.heading, c.content,
          1 - (c.embedding <=> ${vector}::vector) AS score
        FROM agent_chunks c
        JOIN articles a ON a.id = c.article_id
        WHERE a.status = 'PUBLISHED'
        ORDER BY c.embedding <=> ${vector}::vector
        LIMIT 24
      `,
      semanticTimeoutMs,
      null,
    );

    if (!semantic) {
      return null;
    }

    const topSemanticScore = semantic.length
      ? Number(semantic[0]!.score)
      : 0;
    const activeLexical =
      topSemanticScore >= strongSemanticScore ? [] : lexicalCandidates;
    const lexicalRanks = new Map(
      activeLexical.map((row, index) => [row.id, index + 1]),
    );
    const fused: SqlChunk[] = semantic.map((row) => {
      const rank = lexicalRanks.get(row.id) ?? null;
      const lexicalBoost = rank ? 1 / rank : 0;
      return {
        id: row.id,
        path: row.path,
        title: row.title,
        heading: row.heading,
        content: row.content,
        semanticScore: Number(row.score),
        lexicalRank: rank,
        score: Math.min(1, Number(row.score) * 0.75 + lexicalBoost * 0.25),
      };
    });

    // Lexical-only hits still help when the embedding model misses an exact
    // term, but ignore weak BM25 rows so they cannot crowd out ANN results.
    const semanticIds = new Set(semantic.map((row) => row.id));
    for (const row of activeLexical) {
      if (semanticIds.has(row.id) || row.bm25Score < minimumLexicalFusionScore) {
        continue;
      }

      const rank = lexicalRanks.get(row.id) ?? activeLexical.length;
      fused.push({
        id: row.id,
        path: row.path,
        title: row.title,
        heading: row.heading,
        content: row.content,
        semanticScore: 0,
        lexicalRank: rank,
        score: lexicalFallbackScore(rank - 1),
      });
    }

    return fused.sort((left, right) => right.score - left.score);
  } catch (error) {
    console.warn("[agent] pgvector query unavailable", error);
    return null;
  }
}

function isStrongLexicalMatch(candidates: LexicalCandidate[]) {
  return (
    candidates.length > 0 &&
    candidates[0]!.bm25Score >= strongLexicalScore
  );
}

function toRetrievedChunks(
  candidates: LexicalCandidate[],
): RetrievedAgentChunk[] {
  return candidates.map((row, index) => ({
    path: row.path,
    title: row.title,
    heading: row.heading,
    content: row.content,
    score: lexicalFallbackScore(index),
  }));
}

function lexicalFallbackScore(index: number) {
  // BM25-only matches do not have a cosine score. Keep them above the
  // relevance floor (and high enough for the direct-answer fast path) while
  // still ranking earlier hits higher.
  return Math.max(0.45, 0.6 - index * 0.02);
}

function limitRetrievedChunks(chunks: RetrievedAgentChunk[], allowLowScores = false) {
  const perArticleLimit = new Map<string, number>();
  const results: RetrievedAgentChunk[] = [];
  for (const chunk of chunks) {
    if (!allowLowScores && chunk.score < minimumRelevantScore) continue;
    const currentCount = perArticleLimit.get(chunk.path) ?? 0;
    if (currentCount >= 2) continue;
    perArticleLimit.set(chunk.path, currentCount + 1);
    results.push(chunk);
    if (results.length >= 6) break;
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

const lexicalStopWords = new Set([
  "怎么",
  "如何",
  "什么",
  "哪些",
  "哪里",
  "可以",
  "需要",
  "请问",
  "一下",
  "有没有",
  "是否",
  "我想",
  "想要",
  "为什么",
  "这个",
  "那个",
  "以及",
  "或者",
  "还是",
  "就是",
  "但是",
  "因为",
  "所以",
  "如果",
  "已经",
  "帮我",
  "告诉",
  "介绍",
  "关于",
  "相关",
  "一些",
  "多少",
  "的",
  "了",
  "吗",
  "呢",
  "是",
  "在",
  "我",
  "你",
  "他",
  "她",
  "它",
  "们",
  "和",
  "与",
  "或",
  "及",
  "有",
  "无",
  "就",
  "都",
  "也",
  "很",
  "太",
  "这",
  "那",
  "个",
  "些",
  "请",
  "帮",
  "想",
  "要",
  "能",
  "会",
  "可",
  "对",
  "从",
  "到",
  "把",
  "被",
  "让",
  "给",
  "用",
  "做",
  "说",
  "看",
  "找",
  "问",
  "答",
  "啊",
  "吧",
  "呀",
  "哦",
  "嗯",
  "how",
  "what",
  "which",
  "where",
  "when",
  "why",
  "who",
  "can",
  "could",
  "should",
  "would",
  "the",
  "and",
  "for",
  "with",
  "about",
  "please",
  "tell",
  "me",
  "do",
  "does",
  "is",
  "are",
  "to",
  "of",
  "in",
  "on",
  "a",
  "an",
  "i",
  "my",
]);

/**
 * Turn a natural-language question into a compact BM25 query.
 *
 * The full question rarely matches ParadeDB's tokenizer (for example
 * "校园卡怎么补办？" returns nothing), while its key terms do. Segments are
 * combined across adjacent single-character words so "校园" + "卡" still
 * becomes "校园卡", and question words split the phrase so "补" + "办" becomes
 * "补办" instead of a cross-word fragment.
 */
export function buildLexicalQuery(query: string) {
  const cleaned = query
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return "";
  }

  if (typeof Intl.Segmenter !== "function") {
    return cleaned;
  }

  const segmenter = new Intl.Segmenter("zh", { granularity: "word" });
  const segments = Array.from(segmenter.segment(cleaned))
    .filter((part) => part.isWordLike)
    .map((part) => part.segment.trim())
    .filter(Boolean);

  const terms = new Set<string>();
  let run: string[] = [];

  for (const segment of segments) {
    if (lexicalStopWords.has(segment.toLowerCase())) {
      collectRunTerms(run, terms);
      run = [];
      continue;
    }

    run.push(segment);
  }
  collectRunTerms(run, terms);

  if (terms.size === 0) {
    return "";
  }

  const selected = Array.from(terms)
    .sort((left, right) => right.length - left.length || left.localeCompare(right))
    .slice(0, 8);

  return selected.join(" OR ");
}

function collectRunTerms(segments: string[], terms: Set<string>) {
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!;

    if (!isCjk(segment)) {
      if (segment.length >= 2) {
        terms.add(segment);
      }
      continue;
    }

    if (segment.length === 1) {
      const next = segments[index + 1];

      if (next && isCjk(next) && next.length === 1) {
        terms.add(segment + next);
      }

      continue;
    }

    terms.add(segment);

    // Extend a real word over adjacent single-character segments, which is how
    // the segmenter often splits names such as 校园 + 卡.
    let rightMerged = segment;
    for (let nextIndex = index + 1; nextIndex < segments.length; nextIndex += 1) {
      const next = segments[nextIndex]!;

      if (
        !isCjk(next) ||
        next.length !== 1 ||
        rightMerged.length + next.length > 4
      ) {
        break;
      }

      rightMerged += next;
      terms.add(rightMerged);
    }

    const preceding = segments[index - 1];
    const beforePreceding = segments[index - 2];
    const precedingIsCoveredSingle =
      preceding !== undefined &&
      preceding.length === 1 &&
      beforePreceding !== undefined &&
      isCjk(beforePreceding) &&
      beforePreceding.length >= 2;

    if (
      preceding &&
      isCjk(preceding) &&
      (preceding.length >= 2 || precedingIsCoveredSingle)
    ) {
      // A preceding word already extends to cover this single character.
      continue;
    }

    let leftMerged = segment;
    for (
      let previousIndex = index - 1;
      previousIndex >= 0;
      previousIndex -= 1
    ) {
      const previous = segments[previousIndex]!;

      if (
        !isCjk(previous) ||
        previous.length !== 1 ||
        leftMerged.length + previous.length > 4
      ) {
        break;
      }

      leftMerged = previous + leftMerged;
      terms.add(leftMerged);
    }
  }
}

function isCjk(value: string) {
  return /[\u3400-\u9fff]/.test(value);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T) {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

function getRetrievalTimeoutMs(env: NodeJS.ProcessEnv = process.env) {
  const parsed = Number(env.AGENT_RETRIEVAL_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultRetrievalTimeoutMs;
}

function safeParseEmbedding(embedding: string) {
  try {
    const value = JSON.parse(embedding) as number[];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}
