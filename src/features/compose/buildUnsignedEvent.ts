import { Event, UnsignedEvent } from "nostr-tools";
import type { UploadedMedia } from "@lib/blossom";

export type ComposeDraft = {
  comment: string;
  refEvent?: Event;
  tagType?: "Reply" | "Quote" | "";
  customEmojis?: CustomEmojiTag[];
  media?: UploadedMedia[];
};

const CLIENT_TAG: string[] = ["client", "getwired.app"];

export type CustomEmojiTag = {
  shortcode: string;
  url: string;
};

function dedupeTags(tags: string[][]): string[][] {
  return Array.from(
    new Map(tags.map((tag) => [tag.join("\0"), tag])).values(),
  );
}

function buildRefTags(refEvent: Event, tagType: "Reply" | "Quote" | ""): string[][] {
  const tags: string[][] = [];

  if (tagType === "Quote") {
    tags.push(["p", refEvent.pubkey], ["q", refEvent.id]);
    return tags;
  }

  tags.push(["p", refEvent.pubkey]);
  tags.push(
    ...refEvent.tags.filter((tag) => tag[0] === "e" || tag[0] === "p"),
  );
  tags.push(["e", refEvent.id]);
  return dedupeTags(tags);
}

function buildCustomEmojiTags(comment: string, customEmojis: CustomEmojiTag[] = []): string[][] {
  return customEmojis
    .filter((emoji) => comment.includes(`:${emoji.shortcode}:`))
    .map((emoji) => ["emoji", emoji.shortcode, emoji.url]);
}

function buildMediaTags(media: UploadedMedia[] = []): string[][] {
  return media.map((item) => {
    const fields = [
      "imeta",
      `url ${item.url}`,
      `m ${item.mime}`,
      `x ${item.sha256}`,
      `size ${item.size}`,
    ];

    if (item.width && item.height) {
      fields.push(`dim ${item.width}x${item.height}`);
    }
    fields.push(...(item.imetaFields ?? []));

    return fields;
  });
}

function buildContent(comment: string, media: UploadedMedia[] = []): string {
  const mediaUrls = media.map((item) => item.url).filter(Boolean);
  if (mediaUrls.length === 0) return comment;

  const body = comment.trimEnd();
  return [body, mediaUrls.join("\n")].filter(Boolean).join("\n\n");
}

export function buildUnsignedEvent(draft: ComposeDraft): UnsignedEvent {
  const { comment, refEvent, tagType = "", customEmojis, media } = draft;
  const created_at = Math.floor(Date.now() / 1000);
  const refTags =
    refEvent && tagType ? buildRefTags(refEvent, tagType) : [];
  const customEmojiTags = buildCustomEmojiTags(comment, customEmojis);
  const mediaTags = buildMediaTags(media);

  return {
    kind: 1,
    tags: dedupeTags([CLIENT_TAG, ...refTags, ...customEmojiTags, ...mediaTags]),
    content: buildContent(comment, media),
    created_at,
    pubkey: "",
  };
}
