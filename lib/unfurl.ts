import type { LinkMetadata } from "./link.js";

export type { LinkMetadata };

const FETCH_TIMEOUT_MS = 5000;
const MAX_HTML_BYTES = 512_000;

function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();

  if (
    lower === "localhost" ||
    lower.endsWith(".localhost") ||
    lower === "0.0.0.0" ||
    lower === "[::1]" ||
    lower === "::1"
  ) {
    return true;
  }

  if (lower.startsWith("127.")) return true;
  if (lower.startsWith("10.")) return true;
  if (lower.startsWith("192.168.")) return true;
  if (/^169\.254\./.test(lower)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(lower)) return true;

  return false;
}

export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    return !isBlockedHostname(parsed.hostname);
  } catch {
    return false;
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseMetaContent(
  html: string,
  key: string,
  attr: "property" | "name",
): string | undefined {
  const patterns = [
    new RegExp(
      `<meta[^>]+${attr}=["']${key}["'][^>]+content=["']([^"']+)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${key}["']`,
      "i",
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return decodeHtmlEntities(match[1].trim());
    }
  }

  return undefined;
}

function parseTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match?.[1] ? decodeHtmlEntities(match[1].trim()) : undefined;
}

function resolveImageUrl(image: string | undefined, baseUrl: string): string | undefined {
  if (!image) return undefined;
  try {
    return new URL(image, baseUrl).href;
  } catch {
    return undefined;
  }
}

function extractMetadata(html: string, pageUrl: string): LinkMetadata {
  const parsed = new URL(pageUrl);
  const title =
    parseMetaContent(html, "og:title", "property") ??
    parseMetaContent(html, "twitter:title", "name") ??
    parseTitle(html);
  const description =
    parseMetaContent(html, "og:description", "property") ??
    parseMetaContent(html, "description", "name") ??
    parseMetaContent(html, "twitter:description", "name");
  const image = resolveImageUrl(
    parseMetaContent(html, "og:image", "property") ??
      parseMetaContent(html, "twitter:image", "name"),
    pageUrl,
  );

  return {
    title,
    description,
    image,
    domain: parsed.hostname.replace(/^www\./, ""),
  };
}

async function readLimitedHtml(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    return response.text();
  }

  const decoder = new TextDecoder();
  let html = "";
  let bytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_HTML_BYTES) break;
    html += decoder.decode(value, { stream: true });
  }

  html += decoder.decode();
  return html;
}

export async function unfurlUrl(target: string): Promise<LinkMetadata | null> {
  if (!isSafeUrl(target)) {
    return null;
  }

  try {
    const response = await fetch(target, {
      headers: {
        "User-Agent": "Wired-LinkPreview/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      const parsed = new URL(target);
      return {
        domain: parsed.hostname.replace(/^www\./, ""),
      };
    }

    const html = await readLimitedHtml(response);
    return extractMetadata(html, response.url || target);
  } catch {
    return null;
  }
}