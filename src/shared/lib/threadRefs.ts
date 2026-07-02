import { nip19 } from "nostr-tools";

export type ThreadRef = {
  id: string;
  relays: string[];
};

const HEX_EVENT_ID_PATTERN = /^[0-9a-f]{64}$/i;

export function normalizeRelayUrl(relay: string): string {
  return relay.replace(/\/+$/, "");
}

export function uniqueRelays(relays: readonly string[]): string[] {
  return [...new Set(relays.map(normalizeRelayUrl).filter(Boolean))];
}

export function encodeThreadRef(
  eventId: string,
  relays: readonly string[] = [],
): string {
  return nip19.neventEncode({
    id: eventId,
    relays: uniqueRelays(relays),
  });
}

export function buildThreadPath(
  eventId: string,
  relays: readonly string[] = [],
): string {
  return `/thread/${encodeThreadRef(eventId, relays)}`;
}

export function decodeThreadRef(ref: string | undefined): ThreadRef | null {
  if (!ref) return null;

  try {
    const decoded = nip19.decode(ref);

    if (decoded.type === "note") {
      return { id: decoded.data as string, relays: [] };
    }

    if (decoded.type === "nevent") {
      return {
        id: decoded.data.id,
        relays: uniqueRelays(decoded.data.relays ?? []),
      };
    }
  } catch {
    if (HEX_EVENT_ID_PATTERN.test(ref)) {
      return { id: ref.toLowerCase(), relays: [] };
    }
  }

  return null;
}
