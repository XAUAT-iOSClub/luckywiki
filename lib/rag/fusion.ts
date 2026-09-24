import type { RagCandidate } from "@/lib/rag/vector";

const RRF_K = 60;

export function fuseRagCandidates(
  candidateLists: RagCandidate[][],
): RagCandidate[] {
  const map = new Map<string, RagCandidate & { rrf: number }>();

  for (const list of candidateLists) {
    list.forEach((candidate, index) => {
      const key =
        candidate.chunk_id ??
        `${candidate.article_path}:${candidate.heading_path.join("/")}`;

      const existing = map.get(key);

      if (!existing) {
        map.set(key, {
          ...candidate,
          rrf: 1 / (RRF_K + index + 1),
        });
        return;
      }

      existing.rrf += 1 / (RRF_K + index + 1);

      if (!existing.match_types.includes(candidate.match_types[0])) {
        existing.match_types.push(candidate.match_types[0]);
      }

      if (candidate.score > existing.score) {
        existing.score = candidate.score;
      }

      if (!existing.content && candidate.content) {
        existing.content = candidate.content;
      }
    });
  }

  return Array.from(map.values()).sort((a, b) => b.rrf - a.rrf);
}
