import { Event, UnsignedEvent } from "nostr-tools";

export type ComposeDraft = {
  comment: string;
  refEvent?: Event;
  tagType?: "Reply" | "Quote" | "";
  customEmojis?: CustomEmojiTag[];
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

export function buildUnsignedEvent(draft: ComposeDraft): UnsignedEvent {
  const { comment, refEvent, tagType = "", customEmojis } = draft;
  const created_at = Math.floor(Date.now() / 1000);
  const refTags =
    refEvent && tagType ? buildRefTags(refEvent, tagType) : [];
  const customEmojiTags = buildCustomEmojiTags(comment, customEmojis);

  return {
    kind: 1,
    tags: dedupeTags([CLIENT_TAG, ...refTags, ...customEmojiTags]),
    content: comment,
    created_at,
    pubkey: "",
  };
}
