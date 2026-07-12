export const THREAD_EXCERPT_MAX_LENGTH = 180;

export function cleanThreadExcerpt(content: string): string {
  const cleaned = content
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/nostr:(?:note|nevent|npub|nprofile|naddr)1\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length <= THREAD_EXCERPT_MAX_LENGTH) return cleaned;
  return `${cleaned.slice(0, THREAD_EXCERPT_MAX_LENGTH - 1).trimEnd()}…`;
}
