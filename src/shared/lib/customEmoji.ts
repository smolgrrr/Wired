import { normalizeUrl } from "@link/link";

export type BodyEmoji = {
  shortcode: string;
  url: string;
};

export function getBodyEmojis(tags: string[][] = []): BodyEmoji[] {
  return tags
    .filter((tag) => tag[0] === "emoji" && tag[1] && tag[2])
    .map((tag) => ({ shortcode: tag[1], url: tag[2] }));
}

export function buildEmojiMap(emojis: BodyEmoji[] = []) {
  const emojiMap = new Map<string, string>();

  for (const emoji of emojis) {
    const normalizedUrl = normalizeUrl(emoji.url);

    if (!emoji.shortcode || !normalizedUrl) continue;
    emojiMap.set(emoji.shortcode, normalizedUrl);
  }

  return emojiMap;
}

export function getProxiedEmojiUrl(url: string) {
  if (!url.startsWith("https://poa.st/")) return "";

  return `https://external-content.duckduckgo.com/iu/?u=${encodeURIComponent(url)}`;
}

export function getEmojiDisplayUrls(url: string) {
  const proxiedUrl = getProxiedEmojiUrl(url);

  return proxiedUrl ? [proxiedUrl, url] : [url];
}

export function getEmojiPickerDisplayUrls(previewUrl: string, url: string) {
  return [...new Set([previewUrl, url].filter(Boolean))];
}
