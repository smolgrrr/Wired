import { Event } from "nostr-tools";
import {
  extractMedia,
  normalizeUrl,
  parseBareMediaUrls,
  parseImetaTags,
  stripMediaUrls,
  type MediaItem,
} from "./mediaUtils";
import { extractLinkUrls, stripLinkUrls, type LinkItem } from "./linkUtils";

const NOSTR_REF_PATTERN =
  /nostr:(?:note|nevent|naddr|npub|nprofile|nrelay)1[a-z0-9]+/gi;

const CONTENT_URL_PATTERN =
  /https?:\/\/[^\s<>"')\]]+(?:\?[^\s<>"')\]]*)?/gi;

/** Remove Nostr URI tokens from visible text — kept in event data, not shown. */
function stripNostrRefs(content: string): string {
  return content
    .replace(NOSTR_REF_PATTERN, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type { LinkItem };

export type Attachment =
  | { kind: "media"; item: MediaItem }
  | { kind: "link"; item: LinkItem };

export type ParsedContent = {
  comment: string;
  media: MediaItem[];
  links: LinkItem[];
  attachments: Attachment[];
};

function buildAttachmentsFromEvent(
  event: Event,
  media: MediaItem[],
  links: LinkItem[],
): Attachment[] {
  const imetaItems = parseImetaTags(event.tags ?? []);
  const bareMediaByUrl = new Map(
    parseBareMediaUrls(event.content).map((item) => [item.url, item]),
  );
  const linkByUrl = new Map(links.map((item) => [item.url, item]));
  const imetaUrls = new Set(imetaItems.map((item) => item.url));

  const attachments: Attachment[] = imetaItems.map((item) => ({
    kind: "media",
    item,
  }));

  const seen = new Set(imetaUrls);

  for (const match of event.content.matchAll(CONTENT_URL_PATTERN)) {
    const normalized = normalizeUrl(match[0]);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);

    const mediaItem = bareMediaByUrl.get(normalized);
    if (mediaItem) {
      attachments.push({ kind: "media", item: mediaItem });
      continue;
    }

    const linkItem = linkByUrl.get(normalized);
    if (linkItem) {
      attachments.push({ kind: "link", item: linkItem });
    }
  }

  return attachments;
}

export function parseContent(event: Event): ParsedContent {
  const media = extractMedia(event);
  const withoutMedia = stripMediaUrls(event.content, media);
  const knownMediaUrls = new Set(media.map((item) => item.url));
  const links = extractLinkUrls(withoutMedia, knownMediaUrls);
  const withoutLinks = stripLinkUrls(withoutMedia, links);
  const attachments = buildAttachmentsFromEvent(event, media, links);

  return {
    comment: stripNostrRefs(withoutLinks),
    media,
    links,
    attachments,
  };
}