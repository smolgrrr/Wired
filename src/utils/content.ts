import { Event } from "nostr-tools";
import { extractMedia, stripMediaUrls, type MediaItem } from "./mediaUtils";

const NOSTR_REF_PATTERN =
  /nostr:(?:note|nevent|naddr|npub|nprofile|nrelay)1[a-z0-9]+/gi;

/** Remove Nostr URI tokens from visible text — kept in event data, not shown. */
function stripNostrRefs(content: string): string {
  return content
    .replace(NOSTR_REF_PATTERN, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type ParsedContent = {
  comment: string;
  media: MediaItem[];
};

export function parseContent(event: Event): ParsedContent {
  const media = extractMedia(event);
  const withoutMedia = stripMediaUrls(event.content, media);

  return {
    comment: stripNostrRefs(withoutMedia),
    media,
  };
}