"use server";

import { searchArticles, type SearchResults } from "@/lib/search";

export async function searchArticlesAction(query: string, page = 1, pageSize = 5): Promise<SearchResults> {
  return searchArticles({ query, page, pageSize });
}
