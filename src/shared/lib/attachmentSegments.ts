import type { Attachment } from "@lib/content";
import type { MediaItem } from "@lib/mediaUtils";

export type AttachmentSegment =
  | { kind: "item"; attachment: Attachment }
  | { kind: "imageGrid"; items: MediaItem[]; hiddenCount: number };

const GRID_MAX_VISIBLE = 4;

function flushImageRun(run: MediaItem[]): AttachmentSegment[] {
  if (run.length === 0) return [];

  if (run.length === 1) {
    return [{ kind: "item", attachment: { kind: "media", item: run[0] } }];
  }

  if (run.length <= GRID_MAX_VISIBLE) {
    return [{ kind: "imageGrid", items: run, hiddenCount: 0 }];
  }

  return [
    {
      kind: "imageGrid",
      items: run.slice(0, GRID_MAX_VISIBLE),
      hiddenCount: run.length - GRID_MAX_VISIBLE,
    },
  ];
}

export function segmentAttachments(attachments: Attachment[]): AttachmentSegment[] {
  const segments: AttachmentSegment[] = [];
  let imageRun: MediaItem[] = [];

  const flushRun = () => {
    if (imageRun.length === 0) return;
    segments.push(...flushImageRun(imageRun));
    imageRun = [];
  };

  for (const attachment of attachments) {
    if (attachment.kind === "link") {
      flushRun();
      segments.push({ kind: "item", attachment });
      continue;
    }

    if (attachment.item.type !== "image") {
      flushRun();
      segments.push({ kind: "item", attachment });
      continue;
    }

    imageRun.push(attachment.item);
  }

  flushRun();
  return segments;
}