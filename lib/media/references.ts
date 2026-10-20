import type { Prisma } from "@/generated/prisma/client";
import { extractMediaUrls } from "@/lib/media/urls";

export type MediaReferenceSyncResult = {
  linked: number;
  removed: number;
};

/**
 * Reconciles the media references for one article body. Called inside the
 * article save transaction so a reference can never point at a deleted asset
 * or disappear because of a failed save.
 */
export async function syncArticleMediaReferences(
  tx: Prisma.TransactionClient,
  articleId: string,
  markdown: string,
  now = new Date(),
): Promise<MediaReferenceSyncResult> {
  const urls = extractMediaUrls(markdown);
  const assets = urls.length
    ? await tx.mediaAsset.findMany({
        where: {
          deletedAt: null,
          url: { in: urls },
        },
        select: {
          id: true,
        },
      })
    : [];
  const nextAssetIds = new Set(assets.map((asset) => asset.id));
  const existingReferences = await tx.mediaReference.findMany({
    where: { articleId },
    select: { assetId: true },
  });
  const existingAssetIds = new Set(
    existingReferences.map((reference) => reference.assetId),
  );
  const removedAssetIds = [...existingAssetIds].filter(
    (assetId) => !nextAssetIds.has(assetId),
  );
  const addedAssetIds = [...nextAssetIds].filter(
    (assetId) => !existingAssetIds.has(assetId),
  );

  if (removedAssetIds.length > 0) {
    await tx.mediaReference.deleteMany({
      where: {
        articleId,
        assetId: { in: removedAssetIds },
      },
    });
  }

  if (addedAssetIds.length > 0) {
    await tx.mediaReference.createMany({
      data: addedAssetIds.map((assetId) => ({ articleId, assetId })),
      skipDuplicates: true,
    });
  }

  if (nextAssetIds.size > 0) {
    await tx.mediaAsset.updateMany({
      where: { id: { in: [...nextAssetIds] } },
      data: { lastUsedAt: now },
    });
  }

  return {
    linked: nextAssetIds.size,
    removed: removedAssetIds.length,
  };
}
