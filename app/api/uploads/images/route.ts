import { NextResponse } from "next/server";
import { canWriteArticles } from "@/lib/auth/permissions";
import { getCurrentSession } from "@/lib/auth/session";
import {
  buildImageMarkdown,
  deleteImageObject,
  ImageUploadError,
  uploadImageFile,
  type UploadedImage,
} from "@/lib/image-hosting";
import { recordUploadedMediaAsset } from "@/lib/media/library";
import { revalidateLocalizedPath } from "@/lib/i18n/revalidate";

export async function POST(request: Request) {
  const session = await getCurrentSession();

  if (!session || !canWriteArticles(session.user)) {
    return NextResponse.json(
      {
        code: "UNAUTHORIZED",
        error: "You do not have permission to upload images.",
      },
      { status: 401 },
    );
  }

  const formData = await request.formData();
  const fileEntry = formData.get("file");

  if (!(fileEntry instanceof File)) {
    return NextResponse.json(
      {
        code: "MISSING_FILE",
        error: "No image file was provided.",
      },
      { status: 400 },
    );
  }

  let uploadedImage: UploadedImage;

  try {
    uploadedImage = await uploadImageFile(fileEntry);
  } catch (error) {
    return uploadErrorResponse(error);
  }

  const altText =
    String(formData.get("alt") ?? "")
      .trim()
      .replace(/\.[^.]+$/u, "") || fileEntry.name.replace(/\.[^.]+$/u, "");

  try {
    const asset = await recordUploadedMediaAsset({
      altText,
      file: {
        name: fileEntry.name,
        size: fileEntry.size,
        type: fileEntry.type,
      },
      uploadedById: session.user.id,
      upload: uploadedImage,
    });

    revalidateLocalizedPath("/admin/media");

    return NextResponse.json({
      assetId: asset.id,
      height: uploadedImage.height,
      key: uploadedImage.key,
      markdown: buildImageMarkdown(uploadedImage.url, altText),
      provider: uploadedImage.provider,
      size: fileEntry.size,
      url: uploadedImage.url,
      width: uploadedImage.width,
    });
  } catch (error) {
    // Never leave a blob behind when the database row could not be written.
    await deleteImageObject(uploadedImage.key, uploadedImage.provider).catch((cleanupError) => {
      console.error("[media] failed to roll back an untracked upload", cleanupError);
    });

    return NextResponse.json(
      {
        code: "UPLOAD_FAILED",
        error:
          error instanceof Error
            ? error.message
            : "The image was uploaded but could not be saved to the media library.",
      },
      { status: 500 },
    );
  }
}

function uploadErrorResponse(error: unknown) {
  if (error instanceof ImageUploadError) {
    return NextResponse.json(
      {
        code: error.code,
        error: error.message,
      },
      { status: error.status },
    );
  }

  return NextResponse.json(
    {
      code: "UPLOAD_FAILED",
      error: error instanceof Error ? error.message : "Failed to upload image.",
    },
    { status: 500 },
  );
}
