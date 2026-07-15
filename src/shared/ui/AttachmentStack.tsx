import type { Attachment } from "@lib/content";
import { segmentAttachments } from "@lib/attachmentSegments";
import { LinkPreview } from "./LinkPreview";
import { MediaAttachment, MediaGrid } from "./NoteMedia";
import type { MediaPresentationVerdict } from "../lib/mediaModeration";

export function AttachmentStack({
  attachments,
  compact,
  imagePriority = false,
  mediaVerdicts,
}: {
  attachments: Attachment[];
  compact?: boolean;
  imagePriority?: boolean;
  mediaVerdicts?: ReadonlyMap<string, MediaPresentationVerdict>;
}) {
  if (attachments.length === 0) return null;

  const segments = segmentAttachments(attachments);

  return (
    <div
      className="flex flex-col gap-3"
      aria-label={
        attachments.length > 1 ? `${attachments.length} attachments` : "attachment"
      }
    >
      {segments.map((segment) => {
        if (segment.kind === "imageGrid") {
          return (
            <MediaGrid
              key={segment.items.map((item) => item.url).join("|")}
              items={segment.items}
              hiddenCount={segment.hiddenCount}
              compact={compact}
              priority={imagePriority}
              verdicts={mediaVerdicts}
            />
          );
        }

        const { attachment } = segment;
        if (attachment.kind === "media") {
          return (
            <MediaAttachment
              key={attachment.item.url}
              item={attachment.item}
              compact={compact}
              priority={imagePriority}
              verdict={mediaVerdicts?.get(attachment.item.url)}
            />
          );
        }

        return (
          <LinkPreview
            key={attachment.item.url}
            url={attachment.item.url}
          />
        );
      })}
    </div>
  );
}
