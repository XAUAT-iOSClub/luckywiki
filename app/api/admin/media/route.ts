import { NextResponse } from "next/server";
import { canWriteArticles } from "@/lib/auth/permissions";
import { getCurrentSession } from "@/lib/auth/session";
import {
  listMediaAssets,
  type MediaSort,
  type MediaUsageFilter,
} from "@/lib/media/library";

const usageFilters = new Set<MediaUsageFilter>(["all", "used", "unused"]);
const sortOptions = new Set<MediaSort>(["newest", "oldest", "largest", "mostUsed"]);

export async function GET(request: Request) {
  const session = await getCurrentSession();

  if (!session || !canWriteArticles(session.user)) {
    return NextResponse.json(
      { code: "UNAUTHORIZED", error: "You do not have permission to view media." },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const usageValue = searchParams.get("usage");
  const sortValue = searchParams.get("sort");
  const usage = usageFilters.has(usageValue as MediaUsageFilter)
    ? (usageValue as MediaUsageFilter)
    : "all";
  const sort = sortOptions.has(sortValue as MediaSort)
    ? (sortValue as MediaSort)
    : "newest";
  const query = searchParams.get("q")?.trim() ?? "";
  const page = Number(searchParams.get("page")) || 1;
  const limit = Number(searchParams.get("limit")) || 24;

  const result = await listMediaAssets({
    page,
    pageSize: limit,
    query,
    sort,
    usage,
  });

  return NextResponse.json({ data: result });
}
