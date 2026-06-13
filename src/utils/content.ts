import { Event } from "nostr-tools";

const NOSTR_REF_PATTERN =
  /nostr:(?:note|nevent|naddr|npub|nprofile|nrelay)1[a-z0-9]+/gi;

/** Remove Nostr URI tokens from visible text — kept in event data, not shown. */
function stripNostrRefs(content: string): string {
  return content
    .replace(NOSTR_REF_PATTERN, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseContent(event: Event) {
  return {
    comment: stripNostrRefs(event.content),
  };
}