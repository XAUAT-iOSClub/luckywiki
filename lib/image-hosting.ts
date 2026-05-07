import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const defaultMaxImageUploadBytes = 5 * 1024 * 1024;
const defaultAltText = "image";

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

export type ImageHostingConfig = {
  accessKeyId: string;
  bucket: string;
  endpoint?: string;
  pathPrefix?: string;
  publicUrlBase?: string;
  region: string;
  secretAccessKey: string;
};

type BuildImageObjectKeyOptions = {
  id?: string;
  now?: Date;
  pathPrefix?: string;
};

type UploadedImage = {
  key: string;
  url: string;
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

export function buildImageMarkdown(url: string, altText = defaultAltText) {
  const safeAltText = altText
    .trim()
    .replace(/[\[\]]/gu, "")
    .replace(/\s+/gu, " ");

  return `![${safeAltText || defaultAltText}](${url})`;
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

export async function uploadImageFile(file: File): Promise<UploadedImage> {
  validateImageFile(file);

  const config = getImageHostingConfig();
  const key = buildImageObjectKey(file.name, file.type, {
    pathPrefix: config.pathPrefix,
  });
  const client = getS3Client(config);

  try {
    await client.send(
      new PutObjectCommand({
        Body: Buffer.from(await file.arrayBuffer()),
        Bucket: config.bucket,
        CacheControl: "public, max-age=31536000, immutable",
        ContentDisposition: "inline",
        ContentType: file.type,
        Key: key,
      }),
    );
  } catch (error) {
    throw new ImageUploadError(
      "UPLOAD_FAILED",
      error instanceof Error ? error.message : "Failed to upload image.",
      500,
    );
  }

  return {
    key,
    url: resolveImagePublicUrl(config, key),
  };
}

function validateImageFile(file: File) {
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

function getImageHostingConfig(): ImageHostingConfig {
  return {
    accessKeyId: getRequiredEnv("IMAGE_HOSTING_ACCESS_KEY_ID"),
    bucket: getRequiredEnv("IMAGE_HOSTING_BUCKET"),
    endpoint: normalizeOptionalEnv("IMAGE_HOSTING_ENDPOINT"),
    pathPrefix: normalizeOptionalEnv("IMAGE_HOSTING_PATH_PREFIX"),
    publicUrlBase: normalizeOptionalEnv("IMAGE_HOSTING_PUBLIC_URL_BASE"),
    region: getRequiredEnv("IMAGE_HOSTING_REGION"),
    secretAccessKey: getRequiredEnv("IMAGE_HOSTING_SECRET_ACCESS_KEY"),
  };
}

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new ImageUploadError(
      "UPLOAD_NOT_CONFIGURED",
      `Missing required image hosting environment variable: ${name}.`,
      500,
    );
  }

  return value;
}

function normalizeOptionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
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
