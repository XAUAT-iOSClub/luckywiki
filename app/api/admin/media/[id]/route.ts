import { NextResponse } from "next/server";
import { LogAction } from "@/generated/prisma/enums";
import { canWriteArticles } from "@/lib/auth/permissions";
import { getCurrentSession } from "@/lib/auth/session";
import { revalidateLocalizedPath } from "@/lib/i18n/revalidate";
import {
  deleteMediaAsset,
  MediaAssetError,
} from "@/lib/media/library";
import { prisma } from "@/lib/prisma";

type Params = Promise<{ id: string }>;

export async function DELETE(request: Request, { params }: { params: Params }) {
  const session = await getCurrentSession();

  if (!session || !canWriteArticles(session.user)) {
    return NextResponse.json(
      { code: "UNAUTHORIZED", error: "You do not have permission to delete media." },
      { status: 401 },
    );
  }

  const { id } = await params;
  const force = new URL(request.url).searchParams.get("force") === "1";

  try {
    const result = await deleteMediaAsset({
      actor: {
        id: session.user.id,
        role: session.user.role,
      },
      assetId: id,
      force,
    });

    await prisma.log
      .create({
        data: {
          action: LogAction.DELETE_MEDIA,
          detail: JSON.stringify({
            fileName: result.fileName,
            forced: force && result.referenceCount > 0,
            referenceCount: result.referenceCount,
            size: result.size,
          }),
          targetId: result.id,
          targetType: "MediaAsset",
          userId: session.user.id,
        },
      })
      .catch((logError) => {
        console.error("[media] failed to write the delete log", logError);
      });

    revalidateLocalizedPath("/admin/media");

    return NextResponse.json({
      data: {
        id: result.id,
        referenceCount: result.referenceCount,
      },
    });
  } catch (error) {
    if (error instanceof MediaAssetError) {
      return NextResponse.json(
        {
          code: error.code,
          error: error.message,
          referenceCount: error.referenceCount,
        },
        { status: error.status },
      );
    }

    return NextResponse.json(
      {
        code: "DELETE_FAILED",
        error:
          error instanceof Error ? error.message : "Failed to delete the media asset.",
      },
      { status: 500 },
    );
  }
}
