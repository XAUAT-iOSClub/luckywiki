import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { BlobNotFoundError, del, list, put } from "@vercel/blob";
import sharp from "sharp";

const defaultMaxImageUploadBytes = 5 * 1024 * 1024;

const allowedImageMimeTypes = new Set([
  "image/apng",
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/webp",
]);

const fileExtensionByMimeType: Record<string, string> = {
  "image/apng": "apng",
  "image/avif": "avif",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp",
};

export type ImageUploadErrorCode =
  | "UNAUTHORIZED"
  | "MISSING_FILE"
  | "INVALID_FILE_TYPE"
  | "FILE_TOO_LARGE"
  | "UPLOAD_NOT_CONFIGURED"
  | "UPLOAD_FAILED";

export type ImageHostingProvider = "vercel-blob" | "s3";

export function isImageHostingProvider(value: string): value is ImageHostingProvider {
  return value === "vercel-blob" || value === "s3";
}

export type ImageHostingConfig = {
  accessKeyId: string;
  bucket: string;
  endpoint?: string;
  pathPrefix?: string;
  publicUrlBase?: string;
  region: string;
  secretAccessKey: string;
};

export type ImageHostingProviderConfig =
  | {
      pathPrefix?: string;
      provider: "vercel-blob";
      token: string;
    }
  | ({
      provider: "s3";
    } & ImageHostingConfig);

type BuildImageObjectKeyOptions = {
  id?: string;
  now?: Date;
  pathPrefix?: string;
};

export type UploadedImage = {
  height: number | null;
  key: string;
  provider: ImageHostingProvider;
  url: string;
  width: number | null;
};

export type StoredImageObject = {
  key: string;
  size: number;
  uploadedAt: Date;
  url: string;
};

type UploadableImageFile = Pick<Blob, "arrayBuffer"> & {
  name: string;
  size: number;
  type: string;
};

export class ImageUploadError extends Error {
  code: ImageUploadErrorCode;
  status: number;

  constructor(code: ImageUploadErrorCode, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

let cachedClient: S3Client | null = null;
let cachedClientSignature: string | null = null;

export { buildImageMarkdown } from "@/lib/media/markdown";

export function getMaxImageUploadBytes() {
  const rawValue = process.env.IMAGE_UPLOAD_MAX_BYTES?.trim();

  if (!rawValue) {
    return defaultMaxImageUploadBytes;
  }

  const parsedValue = Number(rawValue);

  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return defaultMaxImageUploadBytes;
  }

  return Math.floor(parsedValue);
}

export function normalizeImagePathPrefix(prefix: string | undefined) {
  return prefix?.trim().replace(/^\/+|\/+$/gu, "") ?? "";
}

export function isImageKeyWithinPrefix(key: string, prefix: string | undefined) {
  const normalizedPrefix = normalizeImagePathPrefix(prefix);

  if (!normalizedPrefix) {
    return true;
  }

  return key === normalizedPrefix || key.startsWith(`${normalizedPrefix}/`);
}

export function buildImageObjectKey(
  fileName: string,
  mimeType: string,
  options: BuildImageObjectKeyOptions = {},
) {
  const now = options.now ?? new Date();
  const id = options.id ?? crypto.randomUUID();
  const baseName = sanitizeUploadedFileBaseName(fileName);
  const extension = getImageExtension(fileName, mimeType);
  const prefix = normalizeImagePathPrefix(options.pathPrefix);
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const file = `${baseName}-${id}.${extension}`;

  return [prefix, year, month, file].filter(Boolean).join("/");
}

export function resolveImagePublicUrl(config: ImageHostingConfig, key: string) {
  const normalizedKey = key.replace(/^\/+/u, "");
  const publicUrlBase = config.publicUrlBase?.replace(/\/+$/u, "");

  if (publicUrlBase) {
    return `${publicUrlBase}/${normalizedKey}`;
  }

  if (!config.endpoint) {
    return `https://${config.bucket}.s3.${config.region}.amazonaws.com/${normalizedKey}`;
  }

  return `${config.endpoint.replace(/\/+$/u, "")}/${config.bucket}/${normalizedKey}`;
}

export async function uploadImageFile(file: UploadableImageFile): Promise<UploadedImage> {
  validateImageFile(file);

  const config = getImageHostingConfig();
  const key = buildImageObjectKey(file.name, file.type, {
    pathPrefix: config.pathPrefix,
  });
  const buffer = Buffer.from(await file.arrayBuffer());
  const dimensions = await readImageDimensions(buffer);

  try {
    if (config.provider === "vercel-blob") {
      const uploadBody = new Blob([buffer], {
        type: file.type,
      });
      const uploadedBlob = await put(key, uploadBody, {
        access: "public",
        addRandomSuffix: false,
        cacheControlMaxAge: 31536000,
        contentType: file.type,
        token: config.token,
      });

      return {
        ...dimensions,
        key: uploadedBlob.pathname,
        provider: config.provider,
        url: uploadedBlob.url,
      };
    }

    const client = getS3Client(config);
    await client.send(
      new PutObjectCommand({
        Body: buffer,
        Bucket: config.bucket,
        CacheControl: "public, max-age=31536000, immutable",
        ContentDisposition: "inline",
        ContentType: file.type,
        Key: key,
      }),
    );

    return {
      ...dimensions,
      key,
      provider: config.provider,
      url: resolveImagePublicUrl(config, key),
    };
  } catch (error) {
    throw new ImageUploadError(
      "UPLOAD_FAILED",
      error instanceof Error ? error.message : "Failed to upload image.",
      500,
    );
  }
}

/**
 * Deletes an object from the provider that originally stored it. Assets keep
 * their provider so switching image hosts does not strand old files.
 */
export async function deleteImageObject(
  key: string,
  provider: ImageHostingProvider,
): Promise<void> {
  const config = getImageHostingConfigForProvider(provider);

  if (!isImageKeyWithinPrefix(key, config.pathPrefix)) {
    throw new Error(
      `Refusing to delete "${key}" because it is outside the configured image path prefix.`,
    );
  }

  if (config.provider === "vercel-blob") {
    try {
      await del(key, { token: config.token });
    } catch (error) {
      if (!(error instanceof BlobNotFoundError)) {
        throw error;
      }
    }
    return;
  }

  await getS3Client(config).send(
    new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: key,
    }),
  );
}

export function getConfiguredImageHostingProvider(): ImageHostingProvider | null {
  if (normalizeOptionalEnv("BLOB_READ_WRITE_TOKEN")) {
    return "vercel-blob";
  }

  if (
    normalizeOptionalEnv("IMAGE_HOSTING_ACCESS_KEY_ID") &&
    normalizeOptionalEnv("IMAGE_HOSTING_BUCKET") &&
    normalizeOptionalEnv("IMAGE_HOSTING_REGION") &&
    normalizeOptionalEnv("IMAGE_HOSTING_SECRET_ACCESS_KEY")
  ) {
    return "s3";
  }

  return null;
}

export function getImageHostingConfigForProvider(
  provider: ImageHostingProvider,
): ImageHostingProviderConfig {
  if (provider === "vercel-blob") {
    return {
      pathPrefix: normalizeOptionalEnv("IMAGE_HOSTING_PATH_PREFIX"),
      provider: "vercel-blob",
      token: getRequiredEnv("BLOB_READ_WRITE_TOKEN"),
    };
  }

  return {
    accessKeyId: getRequiredEnv("IMAGE_HOSTING_ACCESS_KEY_ID"),
    bucket: getRequiredEnv("IMAGE_HOSTING_BUCKET"),
    endpoint: normalizeOptionalEnv("IMAGE_HOSTING_ENDPOINT"),
    pathPrefix: normalizeOptionalEnv("IMAGE_HOSTING_PATH_PREFIX"),
    publicUrlBase: normalizeOptionalEnv("IMAGE_HOSTING_PUBLIC_URL_BASE"),
    provider: "s3",
    region: getRequiredEnv("IMAGE_HOSTING_REGION"),
    secretAccessKey: getRequiredEnv("IMAGE_HOSTING_SECRET_ACCESS_KEY"),
  };
}

/**
 * Turns a public image URL back into the provider-side object key. Used to
 * import images that were uploaded before the media library existed.
 */
export function resolveImageStorageKey(url: string): string | null {
  const provider = getConfiguredImageHostingProvider();

  if (!provider) {
    return null;
  }

  return resolveImageStorageKeyForConfig(url, getImageHostingConfigForProvider(provider));
}

export function resolveImageStorageKeyForConfig(
  url: string,
  config: ImageHostingProviderConfig,
): string | null {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(url);
  } catch {
    return null;
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return null;
  }

  let key: string | null = null;

  if (config.provider === "vercel-blob") {
    if (parsedUrl.hostname.endsWith(".public.blob.vercel-storage.com")) {
      key = decodePathname(parsedUrl.pathname).replace(/^\/+/u, "");
    }
  } else {
    const publicUrlBase = config.publicUrlBase?.replace(/\/+$/u, "");

    if (publicUrlBase && url.startsWith(`${publicUrlBase}/`)) {
      const basePath = new URL(publicUrlBase).pathname.replace(/\/+$/u, "");
      const prefix = normalizeImagePathPrefix(config.pathPrefix);
      const pathname = decodePathname(parsedUrl.pathname);

      key = basePath && pathname.startsWith(`${basePath}/`)
        ? pathname.slice(basePath.length + 1)
        : pathname.replace(/^\/+/u, "");

      // Some deployments point IMAGE_HOSTING_PUBLIC_URL_BASE at a CDN path
      // that already includes the object prefix, while others point at the
      // bucket root. Normalize both shapes to the provider-side key.
      if (prefix && key && !isImageKeyWithinPrefix(key, prefix) && basePath.endsWith(`/${prefix}`)) {
        key = `${prefix}/${key}`;
      }
    } else if (
      parsedUrl.hostname === `${config.bucket}.s3.${config.region}.amazonaws.com` ||
      parsedUrl.hostname === `${config.bucket}.s3.amazonaws.com`
    ) {
      key = decodePathname(parsedUrl.pathname).replace(/^\/+/u, "");
    } else if (config.endpoint && url.startsWith(config.endpoint.replace(/\/+$/u, ""))) {
      const endpointPath = new URL(config.endpoint).pathname.replace(/^\/+|\/+$/gu, "");
      const path = decodePathname(parsedUrl.pathname).replace(/^\/+/u, "");
      const withoutEndpointPath = endpointPath && path.startsWith(`${endpointPath}/`)
        ? path.slice(endpointPath.length + 1)
        : path;

      if (withoutEndpointPath.startsWith(`${config.bucket}/`)) {
        key = withoutEndpointPath.slice(config.bucket.length + 1);
      }
    }
  }

  if (!key || !isImageKeyWithinPrefix(key, config.pathPrefix)) {
    return null;
  }

  return key;
}

export async function listStoredImageObjects(): Promise<StoredImageObject[]> {
  const provider = getConfiguredImageHostingProvider();

  if (!provider) {
    throw new ImageUploadError(
      "UPLOAD_NOT_CONFIGURED",
      "Image hosting is not configured.",
      500,
    );
  }

  const config = getImageHostingConfigForProvider(provider);

  const prefix = normalizeImagePathPrefix(config.pathPrefix);

  if (!prefix) {
    throw new Error(
      "Set IMAGE_HOSTING_PATH_PREFIX before scanning storage so unrelated blobs cannot be deleted.",
    );
  }

  const listPrefix = `${prefix}/`;

  if (config.provider === "vercel-blob") {
    const objects: StoredImageObject[] = [];
    let cursor: string | undefined;

    do {
      const page = await list({
        cursor,
        limit: 1000,
        prefix: listPrefix,
        token: config.token,
      });

      for (const blob of page.blobs) {
        objects.push({
          key: blob.pathname,
          size: blob.size,
          uploadedAt: blob.uploadedAt,
          url: blob.url,
        });
      }

      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);

    return objects;
  }

  const client = getS3Client(config);
  const objects: StoredImageObject[] = [];
  let continuationToken: string | undefined;

  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        ContinuationToken: continuationToken,
        Prefix: listPrefix,
      }),
    );

    for (const object of page.Contents ?? []) {
      if (!object.Key) {
        continue;
      }

      objects.push({
        key: object.Key,
        size: object.Size ?? 0,
        uploadedAt: object.LastModified ?? new Date(0),
        url: resolveImagePublicUrl(config, object.Key),
      });
    }

    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  return objects;
}

function validateImageFile(file: UploadableImageFile) {
  if (!allowedImageMimeTypes.has(file.type)) {
    throw new ImageUploadError(
      "INVALID_FILE_TYPE",
      `Unsupported image type "${file.type || "unknown"}".`,
      415,
    );
  }

  const maxBytes = getMaxImageUploadBytes();
  if (file.size > maxBytes) {
    throw new ImageUploadError(
      "FILE_TOO_LARGE",
      `Image exceeds the ${maxBytes} byte upload limit.`,
      413,
    );
  }
}

async function readImageDimensions(buffer: Buffer) {
  try {
    const metadata = await sharp(buffer).metadata();

    return {
      height: metadata.height ?? null,
      width: metadata.width ?? null,
    };
  } catch {
    return {
      height: null,
      width: null,
    };
  }
}

function getImageHostingConfig(): ImageHostingProviderConfig {
  const vercelBlobToken = normalizeOptionalEnv("BLOB_READ_WRITE_TOKEN");

  if (vercelBlobToken) {
    return {
      pathPrefix: normalizeOptionalEnv("IMAGE_HOSTING_PATH_PREFIX"),
      provider: "vercel-blob",
      token: vercelBlobToken,
    };
  }

  return {
    accessKeyId: getRequiredEnv("IMAGE_HOSTING_ACCESS_KEY_ID"),
    bucket: getRequiredEnv("IMAGE_HOSTING_BUCKET"),
    endpoint: normalizeOptionalEnv("IMAGE_HOSTING_ENDPOINT"),
    pathPrefix: normalizeOptionalEnv("IMAGE_HOSTING_PATH_PREFIX"),
    publicUrlBase: normalizeOptionalEnv("IMAGE_HOSTING_PUBLIC_URL_BASE"),
    provider: "s3",
    region: getRequiredEnv("IMAGE_HOSTING_REGION"),
    secretAccessKey: getRequiredEnv("IMAGE_HOSTING_SECRET_ACCESS_KEY"),
  };
}

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new ImageUploadError(
      "UPLOAD_NOT_CONFIGURED",
      "Image hosting is not configured. Set BLOB_READ_WRITE_TOKEN for Vercel Blob, or configure the IMAGE_HOSTING_* variables for an S3-compatible provider.",
      500,
    );
  }

  return value;
}

function normalizeOptionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function decodePathname(pathname: string) {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

function getS3Client(config: ImageHostingConfig) {
  const signature = [
    config.accessKeyId,
    config.bucket,
    config.endpoint ?? "",
    config.region,
    config.secretAccessKey,
  ].join("|");

  if (cachedClient && cachedClientSignature === signature) {
    return cachedClient;
  }

  cachedClient = new S3Client({
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    endpoint: config.endpoint,
    forcePathStyle: Boolean(config.endpoint),
    region: config.region,
  });
  cachedClientSignature = signature;

  return cachedClient;
}

function sanitizeUploadedFileBaseName(fileName: string) {
  const withoutExtension = fileName.replace(/\.[^.]+$/u, "");
  const sanitized = withoutExtension
    .normalize("NFKD")
    .replace(/[^\w\s-]/gu, "")
    .trim()
    .replace(/[\s_-]+/gu, "-")
    .toLowerCase();

  return sanitized || "image";
}

function getImageExtension(fileName: string, mimeType: string) {
  const extensionFromName = fileName.match(/\.([a-z0-9]+)$/iu)?.[1]?.toLowerCase();

  if (extensionFromName) {
    return extensionFromName;
  }

  return fileExtensionByMimeType[mimeType] ?? "bin";
}
