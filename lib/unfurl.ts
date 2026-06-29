import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { LinkMetadata } from "./link.js";

export type { LinkMetadata };

const FETCH_TIMEOUT_MS = 5000;
const MAX_HTML_BYTES = 512_000;
const MAX_REDIRECTS = 5;
const STANDARD_PORTS: Record<string, string> = {
  "http:": "80",
  "https:": "443",
};

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

function isBlockedIpAddress(address: string): boolean {
  const normalized = address.toLowerCase();

  if (normalized.startsWith("::ffff:")) {
    return isBlockedIpAddress(normalized.slice("::ffff:".length));
  }

  if (isIP(normalized) === 4) {
    if (normalized.startsWith("127.")) return true;
    if (normalized.startsWith("10.")) return true;
    if (normalized.startsWith("192.168.")) return true;
    if (/^169\.254\./.test(normalized)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized)) return true;
    if (normalized === "0.0.0.0") return true;
    return false;
  }

  if (isIP(normalized) === 6) {
    if (normalized === "::1") return true;
    if (normalized === "::") return true;
    if (normalized.startsWith("fe80:")) return true;
    if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true;
  }

  return false;
}

function usesStandardPort(url: URL): boolean {
  const defaultPort = STANDARD_PORTS[url.protocol];
  return Boolean(defaultPort) && (!url.port || url.port === defaultPort);
}

export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    if (!usesStandardPort(parsed)) return false;
    if (isBlockedHostname(parsed.hostname)) return false;
    if (isIP(parsed.hostname) && isBlockedIpAddress(parsed.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

async function resolvesToPublicAddress(hostname: string): Promise<boolean> {
  if (isIP(hostname)) {
    return !isBlockedIpAddress(hostname);
  }

  try {
    const records = await lookup(hostname, { all: true, verbatim: true });
    return records.length > 0 && records.every((record) => !isBlockedIpAddress(record.address));
  } catch {
    return false;
  }
}

async function isSafeFetchUrl(url: string): Promise<boolean> {
  if (!isSafeUrl(url)) return false;
  return resolvesToPublicAddress(new URL(url).hostname);
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

function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400;
}

async function fetchWithSafeRedirects(target: string): Promise<Response | null> {
  let currentUrl = target;

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    if (!(await isSafeFetchUrl(currentUrl))) {
      return null;
    }

    const response = await fetch(currentUrl, {
      headers: {
        "User-Agent": "Wired-LinkPreview/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!isRedirectStatus(response.status)) {
      return response;
    }

    const location = response.headers.get("location");
    if (!location) {
      return response;
    }

    try {
      currentUrl = new URL(location, currentUrl).href;
    } catch {
      return null;
    }
  }

  return null;
}

export async function unfurlUrl(target: string): Promise<LinkMetadata | null> {
  if (!isSafeUrl(target)) {
    return null;
  }

  try {
    const response = await fetchWithSafeRedirects(target);
    if (!response) {
      return null;
    }

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
