import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isSupportedMediaFile,
  uploadMediaFile,
  type BlossomAuthSigner,
  type UploadedMedia,
} from "@lib/blossom";

export const MAX_MEDIA_ATTACHMENTS = 4;

export type MediaUploadStatus = "uploading" | "uploaded" | "failed";

export type MediaUpload = {
  id: string;
  file: File;
  name: string;
  previewUrl?: string;
  status: MediaUploadStatus;
  media?: UploadedMedia;
  error?: string;
};

function createUploadId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createPreviewUrl(file: File): string | undefined {
  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) return undefined;
  if (typeof URL.createObjectURL !== "function") return undefined;
  return URL.createObjectURL(file);
}

function revokePreviewUrl(upload: MediaUpload): void {
  if (!upload.previewUrl || typeof URL.revokeObjectURL !== "function") return;
  URL.revokeObjectURL(upload.previewUrl);
}

function failedUpload(file: File, error: string): MediaUpload {
  return {
    id: createUploadId(),
    file,
    name: file.name,
    previewUrl: createPreviewUrl(file),
    status: "failed",
    error,
  };
}

function pendingUpload(file: File): MediaUpload {
  return {
    id: createUploadId(),
    file,
    name: file.name,
    previewUrl: createPreviewUrl(file),
    status: "uploading",
  };
}

export function useMediaUploads(signer: BlossomAuthSigner) {
  const [uploads, setUploads] = useState<MediaUpload[]>([]);
  const uploadsRef = useRef<MediaUpload[]>([]);

  useEffect(() => {
    uploadsRef.current = uploads;
  }, [uploads]);

  useEffect(() => () => {
    uploadsRef.current.forEach(revokePreviewUrl);
  }, []);

  const startUpload = useCallback((upload: MediaUpload) => {
    void uploadMediaFile({ file: upload.file, signer })
      .then((media) => {
        setUploads((current) =>
          current.map((item) =>
            item.id === upload.id ? { ...item, status: "uploaded", media, error: undefined } : item,
          ),
        );
      })
      .catch((error) => {
        setUploads((current) =>
          current.map((item) =>
            item.id === upload.id
              ? {
                  ...item,
                  status: "failed",
                  error: error instanceof Error ? error.message : "Media upload failed.",
                }
              : item,
          ),
        );
      });
  }, [signer]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const availableSlots = MAX_MEDIA_ATTACHMENTS - uploadsRef.current.length;
    const selectedFiles = Array.from(files).slice(0, Math.max(0, availableSlots));
    if (selectedFiles.length === 0) return;

    const nextUploads = selectedFiles.map((file) =>
      isSupportedMediaFile(file)
        ? pendingUpload(file)
        : failedUpload(file, "Unsupported media type or file is too large."),
    );

    setUploads((current) => [...current, ...nextUploads]);
    nextUploads
      .filter((upload) => upload.status === "uploading")
      .forEach(startUpload);
  }, [startUpload]);

  const removeUpload = useCallback((id: string) => {
    setUploads((current) => {
      const removed = current.find((upload) => upload.id === id);
      if (removed) revokePreviewUrl(removed);
      return current.filter((upload) => upload.id !== id);
    });
  }, []);

  const retryUpload = useCallback((id: string) => {
    const upload = uploadsRef.current.find((item) => item.id === id);
    if (!upload) return;

    setUploads((current) =>
      current.map((item) =>
        item.id === id ? { ...item, status: "uploading", error: undefined } : item,
      ),
    );
    startUpload({ ...upload, status: "uploading", error: undefined });
  }, [startUpload]);

  const clearUploads = useCallback(() => {
    setUploads((current) => {
      current.forEach(revokePreviewUrl);
      return [];
    });
  }, []);

  const uploadedMedia = useMemo(
    () => uploads.flatMap((upload) => upload.status === "uploaded" && upload.media ? [upload.media] : []),
    [uploads],
  );
  const hasUploading = uploads.some((upload) => upload.status === "uploading");
  const hasFailed = uploads.some((upload) => upload.status === "failed");

  return {
    uploads,
    uploadedMedia,
    hasUploading,
    hasFailed,
    addFiles,
    removeUpload,
    retryUpload,
    clearUploads,
  };
}
