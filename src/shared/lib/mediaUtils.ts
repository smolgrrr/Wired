import { Event } from "nostr-tools";
import { normalizeUrl } from "@link/link";
import { normalizeStrippedContent } from "@lib/textCleanup";

export type MediaType = "image" | "video" | "audio";

export type MediaItem = {
  url: string;
  type: MediaType;
  mime?: string;
  width?: number;
  height?: number;
  posterUrl?: string;
  sha256?: string;
};

const MEDIA_URL_PATTERN =
  /https?:\/\/[^\s<>"')\]]+\.(?:jpe?g|png|gif|webp|mp4|webm|mov|mp3|wav|ogg|m4a)(?:\?[^\s<>"')\]]*)?/gi;

const EXTENSION_TYPE: Record<string, MediaType> = {
  jpg: "image",
  jpeg: "image",
  png: "image",
  gif: "image",
  webp: "image",
  mp4: "video",
  webm: "video",
  mov: "video",
  mp3: "audio",
  wav: "audio",
  ogg: "audio",
  m4a: "audio",
};

const MIME_TYPE: Record<string, MediaType> = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/gif": "image",
  "image/webp": "image",
  "video/mp4": "video",
  "video/webm": "video",
  "video/quicktime": "video",
  "audio/mpeg": "audio",
  "audio/wav": "audio",
  "audio/ogg": "audio",
  "audio/mp4": "audio",
};

export function typeFromMediaExtension(url: string): MediaType | null {
  const match = url.match(/\.([a-z0-9]+)(?:\?|$)/i);
  if (!match) return null;
  return EXTENSION_TYPE[match[1].toLowerCase()] ?? null;
}

function typeFromMime(mime?: string): MediaType | null {
  if (!mime) return null;
  return MIME_TYPE[mime.toLowerCase()] ?? null;
}

function resolveMediaType(url: string, mime?: string): MediaType | null {
  return typeFromMime(mime) ?? typeFromMediaExtension(url);
}

function parseImetaFields(tag: string[]): {
  url?: string;
  mime?: string;
  width?: number;
  height?: number;
  posterUrl?: string;
  sha256?: string;
} {
  const fields: Record<string, string> = {};

  for (const part of tag.slice(1)) {
    const spaceIndex = part.indexOf(" ");
    if (spaceIndex === -1) continue;
    const key = part.slice(0, spaceIndex);
    const value = part.slice(spaceIndex + 1).trim();
    if (key && value) fields[key] = value;
  }

  const dim = fields.dim?.match(/^(\d+)x(\d+)$/);
  return {
    url: fields.url,
    mime: fields.m,
    width: dim ? Number(dim[1]) : undefined,
    height: dim ? Number(dim[2]) : undefined,
    posterUrl: fields.image ?? fields.thumb,
    sha256: fields.x,
  };
}

export function parseImetaTags(tags: string[][]): MediaItem[] {
  const items: MediaItem[] = [];

  for (const tag of tags) {
    if (tag[0] !== "imeta") continue;

    const { url, mime, width, height, posterUrl, sha256 } = parseImetaFields(tag);
    if (!url) continue;

    const normalized = normalizeUrl(url);
    if (!normalized) continue;

    const type = resolveMediaType(normalized, mime);
    if (!type) continue;

    const normalizedPosterUrl = posterUrl ? normalizeUrl(posterUrl) : "";
    items.push({
      url: normalized,
      type,
      mime,
      ...(width ? { width } : {}),
      ...(height ? { height } : {}),
      ...(normalizedPosterUrl ? { posterUrl: normalizedPosterUrl } : {}),
      ...(sha256 && /^[0-9a-f]{64}$/i.test(sha256)
        ? { sha256: sha256.toLowerCase() }
        : {}),
    });
  }

  return items;
}

export function parseBareMediaUrls(content: string): MediaItem[] {
  const items: MediaItem[] = [];
  const seen = new Set<string>();

  for (const match of content.matchAll(MEDIA_URL_PATTERN)) {
    const raw = match[0];
    const normalized = normalizeUrl(raw);
    if (!normalized || seen.has(normalized)) continue;

    const type = typeFromMediaExtension(normalized);
    if (!type) continue;

    seen.add(normalized);
    items.push({ url: normalized, type });
  }

  return items;
}

export function extractMedia(event: Event): MediaItem[] {
  const imetaItems = parseImetaTags(event.tags ?? []);
  const seen = new Set(imetaItems.map((item) => item.url));
  const contentItems = parseBareMediaUrls(event.content).filter(
    (item) => !seen.has(item.url),
  );

  return [...imetaItems, ...contentItems];
}

export function stripMediaUrls(content: string, media: MediaItem[]): string {
  if (media.length === 0) return content;

  let result = content;
  for (const item of media) {
    result = result.split(item.url).join("");
  }

  return normalizeStrippedContent(result);
}
