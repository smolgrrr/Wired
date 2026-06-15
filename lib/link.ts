export type LinkMetadata = {
  title?: string;
  description?: string;
  image?: string;
  domain: string;
};

export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return parsed.href;
  } catch {
    return "";
  }
}