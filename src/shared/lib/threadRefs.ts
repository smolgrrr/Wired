import { nip19 } from "nostr-tools";

export type ThreadRef = {
  id: string;
  relays: string[];
};

const HEX_EVENT_ID_PATTERN = /^[0-9a-f]{64}$/i;
const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const NEVENT_PREFIX = "nevent1";
const EVENT_TLV_TYPE = 0;
const RELAY_TLV_TYPE = 1;
const EVENT_ID_LENGTH = 32;

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

function bytesFromBech32Words(words: number[]): number[] {
  const bytes: number[] = [];
  let value = 0;
  let bits = 0;

  for (const word of words) {
    value = (value << 5) | word;
    bits += 5;

    while (bits >= 8) {
      bits -= 8;
      bytes.push((value >> bits) & 0xff);
    }
  }

  return bytes;
}

function parseNeventTlv(bytes: number[]): ThreadRef | null {
  let index = 0;
  let id: string | null = null;
  const relays: string[] = [];

  while (index < bytes.length) {
    const type = bytes[index];
    const length = bytes[index + 1];
    const valueStart = index + 2;
    const valueEnd = valueStart + length;

    if (length === undefined || valueEnd > bytes.length) {
      return null;
    }

    const value = bytes.slice(valueStart, valueEnd);

    if (type === EVENT_TLV_TYPE && length === EVENT_ID_LENGTH) {
      id = value.map((byte) => byte.toString(16).padStart(2, "0")).join("");
    }

    if (type === RELAY_TLV_TYPE) {
      relays.push(String.fromCharCode(...value));
    }

    index = valueEnd;
  }

  return id ? { id, relays: uniqueRelays(relays) } : null;
}

function decodeTruncatedNevent(ref: string): ThreadRef | null {
  if (!ref.startsWith(NEVENT_PREFIX)) return null;

  const data = ref.slice(NEVENT_PREFIX.length).toLowerCase();
  const words = [...data].map((char) => BECH32_CHARSET.indexOf(char));
  if (words.some((word) => word < 0)) return null;

  for (let checksumCharsPresent = 0; checksumCharsPresent < 6; checksumCharsPresent += 1) {
    const dataWords =
      checksumCharsPresent === 0 ? words : words.slice(0, -checksumCharsPresent);
    const decoded = parseNeventTlv(bytesFromBech32Words(dataWords));
    if (decoded) return decoded;
  }

  return null;
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
    const truncatedNevent = decodeTruncatedNevent(ref);
    if (truncatedNevent) return truncatedNevent;

    if (HEX_EVENT_ID_PATTERN.test(ref)) {
      return { id: ref.toLowerCase(), relays: [] };
    }
  }

  return null;
}
