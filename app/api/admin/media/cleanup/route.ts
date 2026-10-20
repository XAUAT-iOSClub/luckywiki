import { NextResponse } from "next/server";
import { LogAction } from "@/generated/prisma/enums";
import { canManageUsers } from "@/lib/auth/permissions";
import { getCurrentSession } from "@/lib/auth/session";
import { revalidateLocalizedPath } from "@/lib/i18n/revalidate";
import { cleanupOrphanMediaAssets } from "@/lib/media/cleanup";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const session = await getCurrentSession();

  if (!session || !canManageUsers(session.user)) {
    return NextResponse.json(
      { code: "FORBIDDEN", error: "Only a root administrator can clean up media." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as { dryRun?: unknown };
  const dryRun = body.dryRun === true;

  try {
    const result = await cleanupOrphanMediaAssets({ dryRun });

    if (!dryRun && result.deleted > 0) {
      await prisma.log
        .create({
          data: {
            action: LogAction.CLEANUP_MEDIA,
            detail: JSON.stringify({
              deleted: result.deleted,
              failed: result.failed,
              freedBytes: result.freedBytes,
              graceDays: result.graceDays,
            }),
            targetId: "media-cleanup",
            targetType: "MediaAsset",
            userId: session.user.id,
          },
        })
        .catch((logError) => {
          console.error("[media] failed to write the cleanup log", logError);
        });

      revalidateLocalizedPath("/admin/media");
    }

    return NextResponse.json({ data: result });
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
