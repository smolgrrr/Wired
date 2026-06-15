import { Event } from "nostr-tools";
import { normalizeUrl } from "@link/link";
import {
  extractMedia,
  parseImetaTags,
  stripMediaUrls,
  type MediaItem,
} from "@lib/mediaUtils";
import { extractLinkUrls, stripLinkUrls, type LinkItem } from "@lib/linkUtils";
import { normalizeStrippedContent } from "@lib/textCleanup";
import { HTTP_URL_PATTERN } from "@lib/url";

const NOSTR_REF_PATTERN =
  /nostr:(?:note|nevent|naddr|npub|nprofile|nrelay)1[a-z0-9]+/gi;

/** Remove Nostr URI tokens from visible text — kept in event data, not shown. */
function stripNostrRefs(content: string): string {
  return normalizeStrippedContent(content.replace(NOSTR_REF_PATTERN, ""));
}

export type { LinkItem };

export type Attachment =
  | { kind: "media"; item: MediaItem }
  | { kind: "link"; item: LinkItem };

export type ParsedContent = {
  comment: string;
  attachments: Attachment[];
};

function buildAttachmentsInOrder(
  content: string,
  imetaItems: MediaItem[],
  mediaByUrl: Map<string, MediaItem>,
  linkByUrl: Map<string, LinkItem>,
): Attachment[] {
  const attachments: Attachment[] = [];
  const seen = new Set<string>();

  for (const match of content.matchAll(HTTP_URL_PATTERN)) {
    const normalized = normalizeUrl(match[0]);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);

    const mediaItem = mediaByUrl.get(normalized);
    if (mediaItem) {
      attachments.push({ kind: "media", item: mediaItem });
      continue;
    }

    const linkItem = linkByUrl.get(normalized);
    if (linkItem) {
      attachments.push({ kind: "link", item: linkItem });
    }
  }

  for (const item of imetaItems) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    attachments.push({ kind: "media", item });
  }

  return attachments;
}

export function parseContent(event: Event): ParsedContent {
  const imetaItems = parseImetaTags(event.tags ?? []);
  const media = extractMedia(event);
  const withoutMedia = stripMediaUrls(event.content, media);
  const knownMediaUrls = new Set(media.map((item) => item.url));
  const links = extractLinkUrls(withoutMedia, knownMediaUrls);
  const withoutLinks = stripLinkUrls(withoutMedia, links);
  const mediaByUrl = new Map(media.map((item) => [item.url, item]));
  const linkByUrl = new Map(links.map((item) => [item.url, item]));
  const attachments = buildAttachmentsInOrder(
    event.content,
    imetaItems,
    mediaByUrl,
    linkByUrl,
  );

  return {
    comment: stripNostrRefs(withoutLinks),
    attachments,
  };
}