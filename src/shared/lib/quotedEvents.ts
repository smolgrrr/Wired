import { nip19, type Event } from "nostr-tools";

export const NOSTR_EVENT_REF_PATTERN =
  /nostr:(?:note|nevent)1[a-z0-9]+/gi;
export const NOSTR_PROFILE_REF_PATTERN =
  /nostr:(?:npub|nprofile)1[a-z0-9]+/gi;
export const NOSTR_REF_PATTERN = NOSTR_EVENT_REF_PATTERN;

export type QuotedRef = {
  id: string;
  relays: string[];
};

export type ProfileRef = {
  pubkey: string;
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

export function decodeProfileRef(ref: string): ProfileRef | null {
  const bech32 = ref.replace(/^nostr:/i, "");
  try {
    const decoded = nip19.decode(bech32);
    if (decoded.type === "npub") {
      return { pubkey: decoded.data as string, relays: [] };
    }
    if (decoded.type === "nprofile") {
      return {
        pubkey: decoded.data.pubkey,
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
  for (const match of content.matchAll(NOSTR_EVENT_REF_PATTERN)) {
    const ref = decodeNostrRef(match[0]);
    if (ref) refs.push(ref);
  }
  return refs;
}

function mergeQuotedRefs(refs: readonly QuotedRef[]): QuotedRef[] {
  const byId = new Map<string, string[]>();
  refs.forEach((ref) => {
    const id = ref.id.toLowerCase();
    byId.set(id, [
      ...new Set([
        ...(byId.get(id) ?? []),
        ...ref.relays.map(normalizeRelayUrl),
      ]),
    ]);
  });
  return [...byId.entries()].map(([id, relays]) => ({ id, relays }));
}

export function extractQuotedRefs(event: Event): QuotedRef[] {
  const refs: QuotedRef[] = [];

  const addTaggedRef = (value: string, relayHints: string[] = []) => {
    if (EVENT_ID_PATTERN.test(value)) {
      refs.push({ id: value.toLowerCase(), relays: relayHints });
      return;
    }

    const decoded = decodeNostrRef(value);
    if (decoded) {
      refs.push({
        id: decoded.id,
        relays: [...decoded.relays, ...relayHints],
      });
    }
  };

  for (const tag of event.tags ?? []) {
    if (tag[0] === "q" && tag[1]) {
      const relayHint = tag[2] ? normalizeRelayUrl(tag[2]) : undefined;
      addTaggedRef(tag[1], relayHint ? [relayHint] : []);
    }
  }

  refs.push(...extractNostrRefs(event.content));

  return mergeQuotedRefs(refs);
}

export function extractMentionedEventRefs(event: Event): QuotedRef[] {
  return mergeQuotedRefs([
    ...extractQuotedRefs(event),
    ...extractEventTagRefs(event),
  ]);
}

export function extractEventTagRefs(event: Event): QuotedRef[] {
  const refs: QuotedRef[] = [];
  for (const tag of event.tags ?? []) {
    if (tag[0] !== "e" || !tag[1] || !EVENT_ID_PATTERN.test(tag[1])) continue;
    const relayHint = tag[2] ? normalizeRelayUrl(tag[2]) : undefined;
    refs.push({
      id: tag[1].toLowerCase(),
      relays: relayHint ? [relayHint] : [],
    });
  }
  return mergeQuotedRefs(refs);
}

/** @deprecated Use extractQuotedRefs instead. */
export function extractQuotedEventIds(event: Event): string[] {
  return extractQuotedRefs(event).map((ref) => ref.id);
}
