import { Event } from "nostr-tools";
import { normalizeUrl } from "@link/link";
import {
  parseImetaTags,
  type MediaItem,
  typeFromMediaExtension,
} from "@lib/mediaUtils";
import { type LinkItem } from "@lib/linkUtils";
import { normalizeStrippedContent } from "@lib/textCleanup";
import { HTTP_URL_PATTERN } from "@lib/url";
import { NOSTR_REF_PATTERN } from "./quotedEvents";

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

type UrlToken = {
  raw: string;
  url: string;
  start: number;
  end: number;
};

function extractUrlTokens(content: string): UrlToken[] {
  const tokens: UrlToken[] = [];

  for (const match of content.matchAll(HTTP_URL_PATTERN)) {
    const raw = match[0];
    const url = normalizeUrl(raw);
    if (!url || match.index === undefined) continue;

    tokens.push({
      raw,
      url,
      start: match.index,
      end: match.index + raw.length,
    });
  }

  return tokens;
}

function stripUrlTokens(content: string, tokens: UrlToken[]): string {
  if (tokens.length === 0) return content;

  let result = "";
  let cursor = 0;
  for (const token of tokens) {
    result += content.slice(cursor, token.start);
    cursor = token.end;
  }
  result += content.slice(cursor);

  return normalizeStrippedContent(result);
}

function parseContentUrls(
  content: string,
  imetaItems: MediaItem[],
): { attachments: Attachment[]; strippedContent: string } {
  const attachments: Attachment[] = [];
  const seen = new Set<string>();
  const strippedTokens: UrlToken[] = [];
  const imetaByUrl = new Map(imetaItems.map((item) => [item.url, item]));

  for (const token of extractUrlTokens(content)) {
    const imetaItem = imetaByUrl.get(token.url);
    const mediaType = imetaItem
      ? imetaItem.type
      : typeFromMediaExtension(token.url);
    const mediaItem =
      imetaItem ?? (mediaType ? { url: token.url, type: mediaType } : null);

    if (mediaItem) {
      strippedTokens.push(token);
      if (!seen.has(token.url)) {
        seen.add(token.url);
        attachments.push({ kind: "media", item: mediaItem });
      }
      continue;
    }

    strippedTokens.push(token);
    if (!seen.has(token.url)) {
      seen.add(token.url);
      attachments.push({ kind: "link", item: { url: token.url } });
    }
  }

  for (const item of imetaItems) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    attachments.push({ kind: "media", item });
  }

  return {
    attachments,
    strippedContent: stripUrlTokens(content, strippedTokens),
  };
}

export function parseContent(event: Event): ParsedContent {
  const imetaItems = parseImetaTags(event.tags ?? []);
  const { attachments, strippedContent } = parseContentUrls(
    event.content,
    imetaItems,
  );

  return {
    comment: stripNostrRefs(strippedContent),
    attachments,
  };
}
