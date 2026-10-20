import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { cleanupOrphanMediaAssets } from "@/lib/media/cleanup";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();

  if (!secret) {
    return NextResponse.json(
      {
        code: "CRON_NOT_CONFIGURED",
        error: "Set CRON_SECRET before enabling the media cleanup cron job.",
      },
      { status: 503 },
    );
  }

  if (!isAuthorizedCronRequest(request, secret)) {
    return NextResponse.json(
      { code: "UNAUTHORIZED", error: "Invalid cron authorization." },
      { status: 401 },
    );
  }

  try {
    const result = await cleanupOrphanMediaAssets({ limit: 200 });

    return NextResponse.json({
      data: {
        cutoff: result.cutoff,
        deleted: result.deleted,
        failed: result.failed,
        freedBytes: result.freedBytes,
        graceDays: result.graceDays,
        scanned: result.scanned,
        skipped: result.skipped,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        code: "CLEANUP_FAILED",
        error:
          error instanceof Error ? error.message : "Failed to clean up media assets.",
      },
      { status: 500 },
    );
  }
}

function isAuthorizedCronRequest(request: Request, secret: string) {
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const receivedBuffer = Buffer.from(header);
  const expectedBuffer = Buffer.from(expected);

  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}
