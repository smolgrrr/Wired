import { normalizeUrl } from "@link/link";
import { typeFromMediaExtension } from "@lib/mediaUtils";
import { normalizeStrippedContent } from "@lib/textCleanup";
import { HTTP_URL_PATTERN } from "@lib/url";

export type LinkItem = { url: string };

function isMediaUrl(url: string): boolean {
  return typeFromMediaExtension(url) !== null;
}

export function extractLinkUrls(
  content: string,
  knownMediaUrls: Set<string> = new Set(),
): LinkItem[] {
  const links: LinkItem[] = [];
  const seen = new Set<string>();

  for (const match of content.matchAll(HTTP_URL_PATTERN)) {
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

  return normalizeStrippedContent(result);
}
