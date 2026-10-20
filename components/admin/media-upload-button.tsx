"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ImageUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/provider";

export function MediaUploadButton() {
  const t = useT();
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleFile(file: File) {
    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("alt", file.name.replace(/\.[^.]+$/u, ""));

      const response = await fetch("/api/uploads/images", {
        body: formData,
        method: "POST",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        code?: string;
        error?: string;
      };

      if (!response.ok) {
        setError(getUploadErrorMessage(payload.code, payload.error, t));
        return;
      }

      router.refresh();
    } catch {
      setError(t.admin.media.errors.uploadFailed);
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <input
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";

          if (file) {
            void handleFile(file);
          }
        }}
        ref={inputRef}
        type="file"
      />
      <Button
        className="rounded-full px-5"
        disabled={isUploading}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        {isUploading ? <Loader2 className="animate-spin" /> : <ImageUp />}
        {isUploading ? t.admin.media.uploading : t.admin.media.upload}
      </Button>
      {error ? (
        <p className="max-w-xs text-right text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function getUploadErrorMessage(
  code: string | undefined,
  fallback: string | undefined,
  t: ReturnType<typeof useT>,
) {
  switch (code) {
    case "FILE_TOO_LARGE":
      return t.admin.articleEditor.uploadErrors.fileTooLarge;
    case "INVALID_FILE_TYPE":
      return t.admin.articleEditor.uploadErrors.invalidFileType;
    case "MISSING_FILE":
      return t.admin.articleEditor.uploadErrors.missingFile;
    case "UNAUTHORIZED":
      return t.admin.articleEditor.uploadErrors.unauthorized;
    case "UPLOAD_NOT_CONFIGURED":
      return t.admin.articleEditor.uploadErrors.uploadNotConfigured;
    default:
      return fallback ?? t.admin.articleEditor.uploadErrors.uploadFailed;
  }
}
