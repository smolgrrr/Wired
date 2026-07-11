import { useRef } from "react";
import { File, ImagePlus, RotateCcw, X } from "lucide-react";
import { Button } from "../../shared/ui/Button";
import type { MediaUpload } from "./useMediaUploads";

const accept = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/mp4",
].join(",");

type MediaUploadPickerProps = {
  uploads: MediaUpload[];
  disabled?: boolean;
  showButton?: boolean;
  showUploads?: boolean;
  onAddFiles: (files: FileList) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
};

function UploadPreview({ upload }: { upload: MediaUpload }) {
  if (upload.previewUrl && upload.file.type.startsWith("image/")) {
    return (
      <img
        src={upload.previewUrl}
        alt=""
        className="h-10 w-10 rounded-sm border border-ghost object-cover"
      />
    );
  }

  if (upload.previewUrl && upload.file.type.startsWith("video/")) {
    return (
      <video
        src={upload.previewUrl}
        muted
        playsInline
        className="h-10 w-10 rounded-sm border border-ghost object-cover"
      />
    );
  }

  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-sm border border-ghost text-meta text-muted">
      <File aria-hidden="true" size={16} />
    </div>
  );
}

export function MediaUploadPicker({
  uploads,
  disabled = false,
  showButton = true,
  showUploads = true,
  onAddFiles,
  onRemove,
  onRetry,
}: MediaUploadPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        className="sr-only"
        onChange={(event) => {
          const files = event.currentTarget.files;
          if (files && files.length > 0) onAddFiles(files);
          event.currentTarget.value = "";
        }}
      />
      {showButton && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          title="attach media"
          aria-label="attach media"
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus aria-hidden="true" size={16} />
        </Button>
      )}
      {showUploads && uploads.length > 0 && (
        <div className="grid grid-cols-1 gap-2" aria-label="media uploads">
          {uploads.map((upload) => (
            <div
              key={upload.id}
              className="flex min-w-0 items-center gap-2 rounded-sm border border-ghost bg-surface px-2 py-1"
            >
              <UploadPreview upload={upload} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-meta text-primary">{upload.name || "media"}</p>
                <p className={upload.status === "failed" ? "text-meta text-danger" : "text-meta text-muted"}>
                  {upload.status === "uploading"
                    ? "uploading..."
                    : upload.status === "uploaded"
                      ? "uploaded"
                      : upload.error || "upload failed"}
                </p>
              </div>
              {upload.status === "failed" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  title="retry upload"
                  aria-label={`retry ${upload.name || "media"} upload`}
                  onClick={() => onRetry(upload.id)}
                >
                  <RotateCcw aria-hidden="true" size={14} />
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                title="remove media"
                aria-label={`remove ${upload.name || "media"}`}
                onClick={() => onRemove(upload.id)}
              >
                <X aria-hidden="true" size={14} />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
