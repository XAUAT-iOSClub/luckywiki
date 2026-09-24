import { z } from "zod";

const DEFAULT_TOP_K = Number(process.env.RAG_DEFAULT_TOP_K ?? 6);
const MAX_TOP_K = Number(process.env.RAG_MAX_TOP_K ?? 20);

export const ragSearchSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1, "query is required")
    .max(200, "query too long"),

  top_k: z
    .number()
    .int()
    .min(1)
    .max(MAX_TOP_K)
    .optional()
    .default(DEFAULT_TOP_K),

  mode: z
    .enum(["auto", "lexical", "vector", "hybrid"])
    .optional()
    .default("auto"),

  include_content: z.boolean().optional().default(true),

  include_context: z.boolean().optional().default(false),
});

export type RagSearchInput = z.infer<typeof ragSearchSchema>;

export interface RagSearchResultItem {
  chunk_id: string | null;
  article_path: string;
  article_title: string;
  heading_path: string[];
  score: number;
  match_types: Array<"lexical" | "vector">;
  excerpt: string;
  content?: string;
  article_url: string;
  updated_at: string | null;
}

export interface RagSearchResponse {
  query: string;
  mode: RagSearchInput["mode"];
  top_k: number;
  took_ms: number;
  results: RagSearchResultItem[];
  context?: string;
}
