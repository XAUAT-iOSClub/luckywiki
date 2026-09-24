import { buildExcerpt } from "@/lib/rag/excerpt";
import { fuseRagCandidates } from "@/lib/rag/fusion";
import { lexicalSearchChunks } from "@/lib/rag/lexical";
import type {
  RagSearchInput,
  RagSearchResultItem,
} from "@/lib/rag/schema";
import { vectorSearchChunks, type RagCandidate } from "@/lib/rag/vector";

function buildArticleUrl(path: string): string {
  const segments = path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `/zh/wiki/${segments || "home"}`;
}

function toApiItem(
  candidate: RagCandidate & { rrf?: number },
  input: RagSearchInput,
): RagSearchResultItem {
  const score = candidate.rrf ?? candidate.score ?? 0;

  return {
    chunk_id: candidate.chunk_id,
    article_path: candidate.article_path,
    article_title: candidate.article_title,
    heading_path: candidate.heading_path,
    score: Number(score.toFixed(6)),
    match_types: candidate.match_types,
    excerpt: buildExcerpt(candidate.content, input.query),
    content: input.include_content ? candidate.content : undefined,
    article_url: buildArticleUrl(candidate.article_path),
    updated_at: candidate.updated_at
      ? candidate.updated_at.toISOString()
      : null,
  };
}

export function buildRagContext(
  items: RagSearchResultItem[],
): string {
  return items
    .map((item, index) => {
      const heading = item.heading_path.length
        ? item.heading_path.join(" / ")
        : item.article_title;

      return [
        `【${index + 1}】${item.article_title} > ${heading}`,
        item.content ?? item.excerpt,
        `来源: ${item.article_path}`,
      ].join("\n");
    })
    .join("\n\n");
}

export async function retrieveRagChunks(
  input: RagSearchInput,
): Promise<RagSearchResultItem[]> {
  const candidateLimit = Math.min(50, input.top_k * 3);

  const wantVector =
    input.mode === "vector" || input.mode === "hybrid" || input.mode === "auto";

  let vectorCandidates: RagCandidate[] = [];

  if (wantVector) {
    try {
      vectorCandidates = await vectorSearchChunks(
        input.query,
        candidateLimit,
      );
    } catch (error) {
      console.error("[rag] vector search failed", error);

      if (input.mode === "vector") {
        throw error;
      }
    }
  }

  const lexicalCandidates = await lexicalSearchChunks(
    input.query,
    candidateLimit,
  );

  if (input.mode === "vector" && vectorCandidates.length === 0) {
    return [];
  }

  if (vectorCandidates.length === 0) {
    return lexicalCandidates
      .slice(0, input.top_k)
      .map((candidate) => toApiItem(candidate, input));
  }

  if (input.mode === "lexical") {
    return lexicalCandidates
      .slice(0, input.top_k)
      .map((candidate) => toApiItem(candidate, input));
  }

  const fused = fuseRagCandidates([
    lexicalCandidates,
    vectorCandidates,
  ]);

  return fused
    .slice(0, input.top_k)
    .map((candidate) => toApiItem(candidate, input));
}
