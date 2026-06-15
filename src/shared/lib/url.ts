export const HTTP_URL_PATTERN =
  /https?:\/\/[^\s<>"')\]]+(?:\?[^\s<>"')\]]*)?/gi;

export function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}