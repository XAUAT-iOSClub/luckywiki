import type { Prisma } from "@/generated/prisma/client";
import type { ImageHostingProvider } from "@/lib/image-hosting";
import {
  deleteImageObject,
  getConfiguredImageHostingProvider,
  isImageHostingProvider,
  listStoredImageObjects,
  type StoredImageObject,
} from "@/lib/image-hosting";
import {
  getMediaOrphanCutoff,
  getMediaOrphanGraceDays,
} from "@/lib/media/policy";
import { extractMediaUrls, normalizeMediaUrl } from "@/lib/media/urls";
import { prisma } from "@/lib/prisma";

export const DEFAULT_MEDIA_CLEANUP_LIMIT = 100;
export const MAX_MEDIA_CLEANUP_LIMIT = 1000;

export type MediaCleanupError = {
  id: string;
  message: string;
  storageKey: string;
};

export type MediaCleanupResult = {
  cutoff: Date;
  deleted: number;
  dryRun: boolean;
  errors: MediaCleanupError[];
  failed: number;
  freedBytes: number;
  graceDays: number;
  scanned: number;
  skipped: number;
};

type DeleteImageObject = (key: string, provider: ImageHostingProvider) => Promise<void>;

/**
 * Deletes unused assets whose last use is older than the grace period.
 * The DB row is locked with `deletedAt` before touching storage so a
 * concurrent article save cannot re-add a reference mid-delete.
 */
export async function cleanupOrphanMediaAssets(options: {
  deleteObject?: DeleteImageObject;
  dryRun?: boolean;
  graceDays?: number;
  limit?: number;
  now?: Date;
} = {}): Promise<MediaCleanupResult> {
  const {
    deleteObject = deleteImageObject,
    dryRun = false,
    graceDays = getMediaOrphanGraceDays(),
    now = new Date(),
  } = options;
  const limit = Math.min(
    MAX_MEDIA_CLEANUP_LIMIT,
    Math.max(1, Math.floor(options.limit ?? DEFAULT_MEDIA_CLEANUP_LIMIT) || DEFAULT_MEDIA_CLEANUP_LIMIT),
  );
  const cutoff = getMediaOrphanCutoff(now, graceDays);
  const where: Prisma.MediaAssetWhereInput = {
    deletedAt: null,
    lastUsedAt: { lt: cutoff },
    references: { none: {} },
  };
  const candidates = await prisma.mediaAsset.findMany({
    where,
    orderBy: [{ lastUsedAt: "asc" }, { id: "asc" }],
    take: limit,
    select: {
      fileName: true,
      id: true,
      provider: true,
      size: true,
      storageKey: true,
    },
  });
  const result: MediaCleanupResult = {
    cutoff,
    deleted: 0,
    dryRun,
    errors: [],
    failed: 0,
    freedBytes: 0,
    graceDays,
    scanned: candidates.length,
    skipped: 0,
  };

  if (dryRun) {
    result.freedBytes = candidates.reduce((total, asset) => total + asset.size, 0);
    return result;
  }

  for (const candidate of candidates) {
    const locked = await prisma.mediaAsset.updateMany({
      where: {
        deletedAt: null,
        id: candidate.id,
        lastUsedAt: { lt: cutoff },
        references: { none: {} },
      },
      data: { deletedAt: now },
    });

    if (locked.count === 0) {
      result.skipped += 1;
      continue;
    }

    if (!isImageHostingProvider(candidate.provider)) {
      result.failed += 1;
      result.skipped += 1;
      result.errors.push({
        id: candidate.id,
        message: `Unknown storage provider "${candidate.provider}".`,
        storageKey: candidate.storageKey,
      });
      await unlockMediaAsset(candidate.id);
      continue;
    }

    try {
      await deleteObject(candidate.storageKey, candidate.provider);
      await prisma.mediaAsset.delete({ where: { id: candidate.id } });
      result.deleted += 1;
      result.freedBytes += candidate.size;
    } catch (error) {
      await unlockMediaAsset(candidate.id);
      result.failed += 1;
      result.errors.push({
        id: candidate.id,
        message: error instanceof Error ? error.message : "Failed to delete media asset.",
        storageKey: candidate.storageKey,
      });
    }
  }

  return result;
}

export type StorageScanResult = {
  cutoff: Date;
  deleted: number;
  dryRun: boolean;
  failed: number;
  freedBytes: number;
  matched: number;
  scanned: number;
  untracked: StoredImageObject[];
};

/**
 * Optional legacy audit: finds objects in the configured storage prefix that
 * have no DB row and are not referenced by any current article. This is opt-in
 * because a shared bucket prefix can contain unrelated files.
 */
export async function cleanupUntrackedStorageObjects(options: {
  dryRun?: boolean;
  graceDays?: number;
  limit?: number;
  now?: Date;
} = {}): Promise<StorageScanResult> {
  const {
    dryRun = false,
    graceDays = getMediaOrphanGraceDays(),
    now = new Date(),
  } = options;
  const limit = Math.min(
    MAX_MEDIA_CLEANUP_LIMIT,
    Math.max(1, Math.floor(options.limit ?? DEFAULT_MEDIA_CLEANUP_LIMIT) || DEFAULT_MEDIA_CLEANUP_LIMIT),
  );
  const provider = getConfiguredImageHostingProvider();

  if (!provider) {
    throw new Error("Image hosting is not configured.");
  }

  const cutoff = getMediaOrphanCutoff(now, graceDays);
  const [objects, trackedAssets, articles] = await Promise.all([
    listStoredImageObjects(),
    prisma.mediaAsset.findMany({ select: { storageKey: true } }),
    prisma.article.findMany({ select: { markdown: true } }),
  ]);
  const trackedKeys = new Set(trackedAssets.map((asset) => asset.storageKey));
  const referencedUrls = new Set<string>();

  for (const article of articles) {
    for (const url of extractMediaUrls(article.markdown)) {
      referencedUrls.add(url);
    }
  }

  const untracked = objects
    .filter((object) => !trackedKeys.has(object.key))
    .filter((object) => object.uploadedAt.getTime() < cutoff.getTime())
    .filter((object) => {
      const normalized = normalizeMediaUrl(object.url);

      // Never delete an object we cannot compare against article content.
      if (!normalized) {
        return false;
      }

      return !referencedUrls.has(normalized);
    })
    .slice(0, limit);
  const result: StorageScanResult = {
    cutoff,
    deleted: 0,
    dryRun,
    failed: 0,
    freedBytes: 0,
    matched: untracked.length,
    scanned: objects.length,
    untracked,
  };

  if (dryRun) {
    result.freedBytes = untracked.reduce((total, object) => total + object.size, 0);
    return result;
  }

  for (const object of untracked) {
    try {
      await deleteImageObject(object.key, provider);
      result.deleted += 1;
      result.freedBytes += object.size;
    } catch {
      result.failed += 1;
    }
  }

  return result;
}

async function unlockMediaAsset(id: string) {
  await prisma.mediaAsset
    .updateMany({
      where: { id, deletedAt: { not: null } },
      data: { deletedAt: null },
    })
    .catch(() => undefined);
}
