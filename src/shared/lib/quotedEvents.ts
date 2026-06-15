import { nip19, type Event } from "nostr-tools";

export const NOSTR_REF_PATTERN =
  /nostr:(?:note|nevent|naddr|npub|nprofile|nrelay)1[a-z0-9]+/gi;

export function decodeNostrRef(ref: string): string | null {
  const bech32 = ref.startsWith("nostr:") ? ref.slice(6) : ref;
  try {
    const decoded = nip19.decode(bech32);
    if (decoded.type === "note") return decoded.data as string;
    if (decoded.type === "nevent") return decoded.data.id;
  } catch {
    return null;
  }
  return null;
}

export function extractNostrRefIds(content: string): string[] {
  const ids: string[] = [];
  for (const match of content.matchAll(NOSTR_REF_PATTERN)) {
    const id = decodeNostrRef(match[0]);
    if (id) ids.push(id);
  }
  return ids;
}

export function extractQuotedEventIds(event: Event): string[] {
  const ids = new Set<string>();

  for (const tag of event.tags ?? []) {
    if (tag[0] === "q" && tag[1]) ids.add(tag[1]);
  }

  for (const id of extractNostrRefIds(event.content)) {
    ids.add(id);
  }

  return [...ids];
}