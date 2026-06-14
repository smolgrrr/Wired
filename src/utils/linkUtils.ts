import { normalizeUrl } from "./mediaUtils";

export type LinkItem = { url: string };

const LINK_URL_PATTERN =
  /https?:\/\/[^\s<>"')\]]+(?:\?[^\s<>"')\]]*)?/gi;

const MEDIA_EXTENSION_PATTERN =
  /\.(?:jpe?g|png|gif|webp|mp4|webm|mov|mp3|wav|ogg|m4a)(?:\?|$)/i;

function isMediaUrl(url: string): boolean {
  return MEDIA_EXTENSION_PATTERN.test(url);
}

function cleanStrippedContent(content: string): string {
  return content
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractLinkUrls(
  content: string,
  knownMediaUrls: Set<string> = new Set(),
): LinkItem[] {
  const links: LinkItem[] = [];
  const seen = new Set<string>();

  for (const match of content.matchAll(LINK_URL_PATTERN)) {
    const normalized = normalizeUrl(match[0]);
    if (!normalized || seen.has(normalized) || knownMediaUrls.has(normalized)) {
      continue;
    }
    if (isMediaUrl(normalized)) continue;

    seen.add(normalized);
    links.push({ url: normalized });
  }

  return links;
}

export function stripLinkUrls(content: string, links: LinkItem[]): string {
  if (links.length === 0) return content;

  let result = content;
  for (const link of links) {
    result = result.split(link.url).join("");
  }

  return cleanStrippedContent(result);
}