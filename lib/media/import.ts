import { getConfiguredImageHostingProvider, resolveImageStorageKey } from "@/lib/image-hosting";
import { extractMediaUrls } from "@/lib/media/urls";
import { prisma } from "@/lib/prisma";

export type ImportExistingMediaSummary = {
  articles: number;
  imported: number;
  linked: number;
  skipped: number;
  urls: number;
};

export type ResyncMediaReferencesSummary = {
  articles: number;
  linked: number;
  removed: number;
};

type ArticleMarkdown = {
  id: string;
  markdown: string;
};

const metadataConcurrency = 8;

async function loadArticles(): Promise<ArticleMarkdown[]> {
  return prisma.article.findMany({
    select: {
      id: true,
      markdown: true,
    },
  });
}

/**
 * Registers images that were uploaded before the media library existed, then
 * rebuilds references for every article. Only URLs that resolve to the
 * configured storage prefix are imported; external images are ignored.
 */
export async function importExistingMediaFromArticles(options: {
  dryRun?: boolean;
  logger?: Pick<Console, "info" | "warn">;
} = {}): Promise<ImportExistingMediaSummary> {
  const { dryRun = false, logger = console } = options;
  const provider = getConfiguredImageHostingProvider();

  if (!provider) {
    throw new Error(
      "Image hosting is not configured. Set BLOB_READ_WRITE_TOKEN or the IMAGE_HOSTING_* variables.",
    );
  }

  const articles = await loadArticles();
  const urls = new Set<string>();

  for (const article of articles) {
    for (const url of extractMediaUrls(article.markdown)) {
      urls.add(url);
    }
  }

  const storageKeyByUrl = new Map<string, string>();

  for (const url of urls) {
    const storageKey = resolveImageStorageKey(url);

    if (storageKey) {
      storageKeyByUrl.set(url, storageKey);
    }
  }

  const existingAssets = await prisma.mediaAsset.findMany({
    where: {
      OR: [
        { url: { in: [...urls] } },
        { storageKey: { in: [...storageKeyByUrl.values()] } },
      ],
    },
    select: {
      storageKey: true,
      url: true,
    },
  });
  const knownUrls = new Set(existingAssets.map((asset) => asset.url));
  const knownKeys = new Set(existingAssets.map((asset) => asset.storageKey));
  const candidates = [...urls].filter((url) => {
    if (knownUrls.has(url)) {
      return false;
    }

    const storageKey = storageKeyByUrl.get(url);

    if (!storageKey) {
      return false;
    }

    return !knownKeys.has(storageKey);
  });
  logger.info(
    `Media import: ${articles.length} article(s), ${urls.size} image URL(s), ${candidates.length} to register.`,
  );

  let imported = 0;

  if (!dryRun && candidates.length > 0) {
    const now = new Date();
    const rows: Array<{
      fileName: string;
      lastUsedAt: Date;
      mimeType: string;
      provider: string;
      size: number;
      storageKey: string;
      updatedAt: Date;
      url: string;
    }> = [];

    for (let index = 0; index < candidates.length; index += metadataConcurrency) {
      const batch = candidates.slice(index, index + metadataConcurrency);
      const metadata = await Promise.all(
        batch.map(async (url) => ({
          ...(await readRemoteImageMetadata(url, 15000)),
          url,
        })),
      );

      for (const entry of metadata) {
        const storageKey = storageKeyByUrl.get(entry.url);

        if (!storageKey) {
          continue;
        }

        rows.push({
          fileName: decodeFileName(storageKey),
          lastUsedAt: now,
          mimeType: entry.mimeType,
          provider,
          size: entry.size,
          storageKey,
          updatedAt: now,
          url: entry.url,
        });
      }

      logger.info(
        `Media import: resolved metadata for ${Math.min(index + batch.length, candidates.length)}/${candidates.length}.`,
      );
    }

    const created = await prisma.mediaAsset.createMany({
      data: rows,
      skipDuplicates: true,
    });
    imported = created.count;
  } else if (dryRun) {
    imported = candidates.length;
  }

  const referenceSummary = await rebuildMediaReferences(articles, { dryRun });

  return {
    articles: articles.length,
    imported,
    linked: referenceSummary.linked,
    skipped: urls.size - candidates.length + (candidates.length - imported),
    urls: urls.size,
  };
}

export async function resyncAllArticleMediaReferences(options: {
  dryRun?: boolean;
  logger?: Pick<Console, "info" | "warn">;
} = {}): Promise<ResyncMediaReferencesSummary> {
  const { dryRun = false } = options;
  const articles = await loadArticles();
  const result = await rebuildMediaReferences(articles, { dryRun });

  return {
    articles: articles.length,
    linked: result.linked,
    removed: result.removed,
  };
}

/**
 * Bulk rebuild used by maintenance scripts. Runtime article saves use the
 * scoped `syncArticleMediaReferences` transaction instead.
 */
async function rebuildMediaReferences(
  articles: ArticleMarkdown[],
  options: { dryRun?: boolean; now?: Date } = {},
) {
  const { dryRun = false, now = new Date() } = options;
  const assets = await prisma.mediaAsset.findMany({
    where: { deletedAt: null },
    select: { id: true, url: true },
  });
  const assetIdByUrl = new Map(assets.map((asset) => [asset.url, asset.id]));
  const existingReferences = await prisma.mediaReference.findMany({
    select: { articleId: true, assetId: true },
  });
  const desiredReferences: Array<{ articleId: string; assetId: string }> = [];
  const usedAssetIds = new Set<string>();

  for (const article of articles) {
    for (const url of extractMediaUrls(article.markdown)) {
      const assetId = assetIdByUrl.get(url);

      if (!assetId) {
        continue;
      }

      desiredReferences.push({ articleId: article.id, assetId });
      usedAssetIds.add(assetId);
    }
  }

  const desiredKeys = new Set(
    desiredReferences.map((reference) => `${reference.articleId}:${reference.assetId}`),
  );
  const removed = existingReferences.filter(
    (reference) => !desiredKeys.has(`${reference.articleId}:${reference.assetId}`),
  ).length;

  if (!dryRun) {
    await prisma.$transaction(async (tx) => {
      await tx.mediaReference.deleteMany({});

      if (desiredReferences.length > 0) {
        await tx.mediaReference.createMany({
          data: desiredReferences,
          skipDuplicates: true,
        });
      }

      if (usedAssetIds.size > 0) {
        await tx.mediaAsset.updateMany({
          where: { id: { in: [...usedAssetIds] } },
          data: { lastUsedAt: now },
        });
      }
    });
  }

  return {
    linked: desiredReferences.length,
    removed,
  };
}

export type RefreshMediaMetadataSummary = {
  failed: number;
  scanned: number;
  updated: number;
};

/**
 * Fills in size/type for assets imported by an earlier run whose HEAD request
 * timed out. Safe to run repeatedly; only zero-byte rows are considered.
 */
export async function refreshMissingMediaMetadata(options: {
  logger?: Pick<Console, "info" | "warn">;
} = {}): Promise<RefreshMediaMetadataSummary> {
  const { logger = console } = options;
  const assets = await prisma.mediaAsset.findMany({
    where: { size: 0 },
    select: { id: true, url: true },
  });
  let updated = 0;
  let failed = 0;

  for (let index = 0; index < assets.length; index += metadataConcurrency) {
    const batch = assets.slice(index, index + metadataConcurrency);
    const results = await Promise.all(
      batch.map(async (asset) => {
        const metadata = await readRemoteImageMetadata(asset.url, 15000);

        if (metadata.size <= 0) {
          return false;
        }

        await prisma.mediaAsset.update({
          where: { id: asset.id },
          data: {
            mimeType: metadata.mimeType,
            size: metadata.size,
          },
        });

        return true;
      }),
    );

    for (const result of results) {
      if (result) {
        updated += 1;
      } else {
        failed += 1;
      }
    }

    logger.info(
      `Media metadata: ${Math.min(index + batch.length, assets.length)}/${assets.length}.`,
    );
  }

  return { failed, scanned: assets.length, updated };
}

async function readRemoteImageMetadata(url: string, timeoutMs = 5000) {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      return fallbackImageMetadata(url);
    }

    return {
      mimeType:
        response.headers.get("content-type")?.split(";")[0]?.trim() ||
        guessMimeType(url),
      size: Number(response.headers.get("content-length") ?? 0) || 0,
    };
  } catch {
    return fallbackImageMetadata(url);
  }
}

function fallbackImageMetadata(url: string) {
  return {
    mimeType: guessMimeType(url),
    size: 0,
  };
}

function guessMimeType(url: string) {
  const extension = url.split("?")[0]?.match(/\.([a-z0-9]+)$/iu)?.[1]?.toLowerCase();

  switch (extension) {
    case "apng":
      return "image/apng";
    case "avif":
      return "image/avif";
    case "gif":
      return "image/gif";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "svg":
      return "image/svg+xml";
    case "webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

function decodeFileName(storageKey: string) {
  const name = storageKey.split("/").pop() || "image";

  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}
