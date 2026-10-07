"use server";

import { searchArticles, type SearchResults } from "@/lib/search";
import { headers } from "next/headers";
import { checkDistributedRateLimit, getClientIp } from "@/lib/rate-limit";

export async function searchArticlesAction(query: string, page = 1, pageSize = 5): Promise<SearchResults> {
  const requestHeaders = await headers();
  const rateLimit = await checkDistributedRateLimit(
    "search",
    getClientIp(requestHeaders),
    30,
    60_000,
  );
  if (!rateLimit.allowed) {
    throw new Error("Too many search requests. Please try again shortly.");
  }
  return searchArticles({ query, page, pageSize });
}
