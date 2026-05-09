import { NextResponse } from "next/server";
import { canWriteArticles } from "@/lib/permissions";
import { getCurrentSession } from "@/lib/session";
import {
  buildImageMarkdown,
  ImageUploadError,
  uploadImageFile,
} from "@/lib/image-hosting";

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

  try {
    const uploadedImage = await uploadImageFile(fileEntry);
    const altText =
      String(formData.get("alt") ?? "")
        .trim()
        .replace(/\.[^.]+$/u, "") || fileEntry.name.replace(/\.[^.]+$/u, "");

    return NextResponse.json({
      key: uploadedImage.key,
      markdown: buildImageMarkdown(uploadedImage.url, altText),
      url: uploadedImage.url,
    });
  } catch (error) {
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
}
