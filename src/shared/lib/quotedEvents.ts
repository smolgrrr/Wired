import { nip19, type Event } from "nostr-tools";

export const NOSTR_REF_PATTERN =
  /nostr:(?:note|nevent|naddr|npub|nprofile|nrelay)1[a-z0-9]+/gi;

export type QuotedRef = {
  id: string;
  relays: string[];
};

const EVENT_ID_PATTERN = /^[0-9a-f]{64}$/i;

export function normalizeRelayUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

export function decodeNostrRef(ref: string): QuotedRef | null {
  const bech32 = ref.replace(/^nostr:/i, "");
  try {
    const decoded = nip19.decode(bech32);
    if (decoded.type === "note") {
      return { id: decoded.data as string, relays: [] };
    }
    if (decoded.type === "nevent") {
      return {
        id: decoded.data.id,
        relays: (decoded.data.relays ?? []).map(normalizeRelayUrl),
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function extractNostrRefs(content: string): QuotedRef[] {
  const refs: QuotedRef[] = [];
  for (const match of content.matchAll(NOSTR_REF_PATTERN)) {
    const ref = decodeNostrRef(match[0]);
    if (ref) refs.push(ref);
  }
  return refs;
}

export function extractQuotedRefs(event: Event): QuotedRef[] {
  const byId = new Map<string, QuotedRef>();

  const addRef = (id: string, relays: string[] = []) => {
    const existing = byId.get(id);
    if (existing) {
      existing.relays = [...new Set([...existing.relays, ...relays])];
      return;
    }
    byId.set(id, { id, relays: [...new Set(relays)] });
  };

  const addTaggedRef = (value: string, relayHints: string[] = []) => {
    if (EVENT_ID_PATTERN.test(value)) {
      addRef(value.toLowerCase(), relayHints);
      return;
    }

    const decoded = decodeNostrRef(value);
    if (decoded) {
      addRef(decoded.id, [...decoded.relays, ...relayHints]);
    }
  };

  for (const tag of event.tags ?? []) {
    if (tag[0] === "q" && tag[1]) {
      const relayHint = tag[2] ? normalizeRelayUrl(tag[2]) : undefined;
      addTaggedRef(tag[1], relayHint ? [relayHint] : []);
    }
  }

  for (const ref of extractNostrRefs(event.content)) {
    addRef(ref.id, ref.relays);
  }

  return [...byId.values()];
}

export function extractMentionedEventRefs(event: Event): QuotedRef[] {
  const byId = new Map<string, QuotedRef>();

  const addRef = (id: string, relays: string[] = []) => {
    const existing = byId.get(id);
    if (existing) {
      existing.relays = [...new Set([...existing.relays, ...relays])];
      return;
    }
    byId.set(id, { id, relays: [...new Set(relays)] });
  };

  extractQuotedRefs(event).forEach((ref) => addRef(ref.id, ref.relays));

  for (const tag of event.tags ?? []) {
    if (tag[0] !== "e" || !tag[1] || !EVENT_ID_PATTERN.test(tag[1])) continue;

    const relayHint = tag[2] ? normalizeRelayUrl(tag[2]) : undefined;
    addRef(tag[1].toLowerCase(), relayHint ? [relayHint] : []);
  }

  return [...byId.values()];
}

/** @deprecated Use extractQuotedRefs instead. */
export function extractQuotedEventIds(event: Event): string[] {
  return extractQuotedRefs(event).map((ref) => ref.id);
}
