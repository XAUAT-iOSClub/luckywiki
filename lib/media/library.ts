import type { Prisma } from "@/generated/prisma/client";
import { ArticleStatus, Role } from "@/generated/prisma/enums";
import {
  deleteImageObject,
  isImageHostingProvider,
  type UploadedImage,
} from "@/lib/image-hosting";
import { normalizeMediaUrl } from "@/lib/media/urls";
import { prisma } from "@/lib/prisma";

export const MEDIA_PAGE_SIZE = 24;
export const MEDIA_MAX_PAGE_SIZE = 100;

export type MediaUsageFilter = "all" | "used" | "unused";
export type MediaSort = "newest" | "oldest" | "largest" | "mostUsed";

export type MediaAssetReference = {
  articleId: string;
  path: string;
  status: ArticleStatus;
  title: string;
};

export type MediaAssetListItem = {
  altText: string | null;
  createdAt: Date;
  fileName: string;
  height: number | null;
  id: string;
  lastUsedAt: Date;
  mimeType: string;
  provider: string;
  referenceCount: number;
  references: MediaAssetReference[];
  size: number;
  uploadedById: string | null;
  uploadedBy: { email: string; name: string } | null;
  url: string;
  width: number | null;
};

export type MediaAssetListResult = {
  assets: MediaAssetListItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

export type MediaAssetStats = {
  totalBytes: number;
  totalCount: number;
  unusedBytes: number;
  unusedCount: number;
  usedCount: number;
};

export type MediaActor = {
  id: string;
  role: Role | string | null | undefined;
};

export type MediaAssetErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "MEDIA_IN_USE"
  | "DELETE_FAILED"
  | "INVALID_STORAGE_PROVIDER";

export class MediaAssetError extends Error {
  code: MediaAssetErrorCode;
  referenceCount?: number;
  status: number;

  constructor(
    code: MediaAssetErrorCode,
    message: string,
    status = 400,
    referenceCount?: number,
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.referenceCount = referenceCount;
  }
}

export async function listMediaAssets(options: {
  page?: number;
  pageSize?: number;
  query?: string;
  sort?: MediaSort;
  usage?: MediaUsageFilter;
}): Promise<MediaAssetListResult> {
  const pageSize = Math.min(
    MEDIA_MAX_PAGE_SIZE,
    Math.max(1, Math.floor(options.pageSize ?? MEDIA_PAGE_SIZE) || MEDIA_PAGE_SIZE),
  );
  const requestedPage = Math.max(1, Math.floor(options.page ?? 1) || 1);
  const query = options.query?.trim() ?? "";
  const usage = options.usage ?? "all";
  const sort = options.sort ?? "newest";

  const where: Prisma.MediaAssetWhereInput = {
    deletedAt: null,
    ...(usage === "used" ? { references: { some: {} } } : {}),
    ...(usage === "unused" ? { references: { none: {} } } : {}),
    ...(query
      ? {
          OR: [
            { fileName: { contains: query, mode: "insensitive" } },
            { altText: { contains: query, mode: "insensitive" } },
            { storageKey: { contains: query, mode: "insensitive" } },
            {
              uploadedBy: {
                is: {
                  OR: [
                    { name: { contains: query, mode: "insensitive" } },
                    { email: { contains: query, mode: "insensitive" } },
                  ],
                },
              },
            },
            {
              references: {
                some: {
                  article: {
                    title: { contains: query, mode: "insensitive" },
                  },
                },
              },
            },
          ],
        }
      : {}),
  };
  const orderBy: Prisma.MediaAssetOrderByWithRelationInput[] =
    sort === "oldest"
      ? [{ createdAt: "asc" }, { id: "asc" }]
      : sort === "largest"
        ? [{ size: "desc" }, { createdAt: "desc" }]
        : sort === "mostUsed"
          ? [{ references: { _count: "desc" } }, { createdAt: "desc" }]
          : [{ createdAt: "desc" }, { id: "desc" }];

  const totalCount = await prisma.mediaAsset.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const assets = await prisma.mediaAsset.findMany({
    where,
    orderBy,
    skip: (page - 1) * pageSize,
    take: pageSize,
    select: {
      altText: true,
      createdAt: true,
      fileName: true,
      height: true,
      id: true,
      lastUsedAt: true,
      mimeType: true,
      provider: true,
      size: true,
      url: true,
      width: true,
      uploadedById: true,
      uploadedBy: {
        select: {
          email: true,
          name: true,
        },
      },
      _count: {
        select: {
          references: true,
        },
      },
      references: {
        orderBy: { createdAt: "desc" },
        take: 3,
        select: {
          article: {
            select: {
              id: true,
              path: true,
              status: true,
              title: true,
            },
          },
        },
      },
    },
  });

  return {
    assets: assets.map((asset) => ({
      altText: asset.altText,
      createdAt: asset.createdAt,
      fileName: asset.fileName,
      height: asset.height,
      id: asset.id,
      lastUsedAt: asset.lastUsedAt,
      mimeType: asset.mimeType,
      provider: asset.provider,
      referenceCount: asset._count.references,
      references: asset.references.map((reference) => ({
        articleId: reference.article.id,
        path: reference.article.path,
        status: reference.article.status,
        title: reference.article.title,
      })),
      size: asset.size,
      uploadedById: asset.uploadedById,
      uploadedBy: asset.uploadedBy,
      url: asset.url,
      width: asset.width,
    })),
    page,
    pageSize,
    totalCount,
    totalPages,
  };
}

export async function getMediaStats(): Promise<MediaAssetStats> {
  const [total, unused] = await Promise.all([
    prisma.mediaAsset.aggregate({
      where: { deletedAt: null },
      _count: { _all: true },
      _sum: { size: true },
    }),
    prisma.mediaAsset.aggregate({
      where: { deletedAt: null, references: { none: {} } },
      _count: { _all: true },
      _sum: { size: true },
    }),
  ]);
  const totalCount = total._count._all;
  const unusedCount = unused._count._all;

  return {
    totalBytes: total._sum.size ?? 0,
    totalCount,
    unusedBytes: unused._sum.size ?? 0,
    unusedCount,
    usedCount: Math.max(0, totalCount - unusedCount),
  };
}

export async function recordUploadedMediaAsset(options: {
  altText?: string | null;
  file: { name: string; size: number; type: string };
  uploadedById: string | null;
  upload: UploadedImage;
}) {
  const { altText, file, uploadedById, upload } = options;
  const url = normalizeMediaUrl(upload.url) ?? upload.url;

  return prisma.mediaAsset.create({
    data: {
      altText: altText?.trim() || null,
      fileName: file.name,
      height: upload.height,
      mimeType: file.type,
      provider: upload.provider,
      size: file.size,
      storageKey: upload.key,
      uploadedById,
      url,
      width: upload.width,
    },
  });
}

export async function deleteMediaAsset(options: {
  actor: MediaActor;
  assetId: string;
  force?: boolean;
}) {
  const { actor, assetId, force = false } = options;
  const asset = await prisma.mediaAsset.findFirst({
    where: { id: assetId, deletedAt: null },
    select: {
      fileName: true,
      id: true,
      provider: true,
      size: true,
      storageKey: true,
      uploadedById: true,
      _count: {
        select: {
          references: true,
        },
      },
    },
  });

  if (!asset) {
    throw new MediaAssetError("NOT_FOUND", "Media asset not found.", 404);
  }

  const referenceCount = asset._count.references;
  const isRoot = actor.role === Role.ROOT;
  const isOwner = asset.uploadedById === actor.id;

  if (referenceCount > 0) {
    if (!force) {
      throw new MediaAssetError(
        "MEDIA_IN_USE",
        "This asset is still used by one or more articles.",
        409,
        referenceCount,
      );
    }

    if (!isRoot) {
      throw new MediaAssetError(
        "FORBIDDEN",
        "Only a root administrator can delete an asset that is still in use.",
        403,
        referenceCount,
      );
    }
  } else if (!isRoot && !isOwner) {
    throw new MediaAssetError(
      "FORBIDDEN",
      "You can only delete assets you uploaded.",
      403,
      0,
    );
  }

  if (!isImageHostingProvider(asset.provider)) {
    throw new MediaAssetError(
      "INVALID_STORAGE_PROVIDER",
      `Unknown storage provider "${asset.provider}".`,
      500,
    );
  }

  const locked = await prisma.mediaAsset.updateMany({
    where: {
      deletedAt: null,
      id: asset.id,
      ...(referenceCount === 0 ? { references: { none: {} } } : {}),
    },
    data: { deletedAt: new Date() },
  });

  if (locked.count === 0) {
    throw new MediaAssetError(
      "NOT_FOUND",
      "Media asset was already removed.",
      404,
    );
  }

  try {
    await deleteImageObject(asset.storageKey, asset.provider);
    await prisma.mediaAsset.delete({ where: { id: asset.id } });
  } catch (error) {
    await prisma.mediaAsset
      .updateMany({
        where: { id: asset.id, deletedAt: { not: null } },
        data: { deletedAt: null },
      })
      .catch(() => undefined);

    throw new MediaAssetError(
      "DELETE_FAILED",
      error instanceof Error ? error.message : "Failed to delete the media asset.",
      500,
    );
  }

  return {
    fileName: asset.fileName,
    id: asset.id,
    referenceCount,
    size: asset.size,
  };
}
