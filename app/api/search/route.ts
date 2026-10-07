import { NextResponse } from "next/server";
import {
  MAX_SEARCH_PAGE_SIZE,
  MAX_SEARCH_QUERY_LENGTH,
  SearchInputError,
  searchArticles,
} from "@/lib/search";
import {
  checkDistributedRateLimit,
  getClientIp,
  RateLimitConfigurationError,
} from "@/lib/rate-limit";

const SEARCH_RATE_LIMIT = 30;
const SEARCH_RATE_WINDOW_MS = 60_000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    MAX_SEARCH_PAGE_SIZE,
    Math.max(1, parseInt(searchParams.get("pageSize") ?? "10", 10) || 10),
  );

  if (!query) {
    return NextResponse.json(
      { error: "Query parameter 'q' is required." },
      { status: 400 },
    );
  }

  if (query.length > MAX_SEARCH_QUERY_LENGTH) {
    return NextResponse.json(
      { error: `Query parameter 'q' must be ${MAX_SEARCH_QUERY_LENGTH} characters or fewer.` },
      { status: 400 },
    );
  }

  try {
    const rateLimit = await checkDistributedRateLimit(
      "search",
      getClientIp(request.headers),
      SEARCH_RATE_LIMIT,
      SEARCH_RATE_WINDOW_MS,
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many search requests." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.max(1, Math.ceil((rateLimit.resetAt - Date.now()) / 1000))),
          },
        },
      );
    }
    const results = await searchArticles({ query, page, pageSize });
    return NextResponse.json({ data: results });
  } catch (error) {
    if (error instanceof SearchInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof RateLimitConfigurationError) {
      return NextResponse.json({ error: "Search rate limiting is unavailable." }, { status: 503 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Search failed." },
      { status: 500 },
    );
  }
}
