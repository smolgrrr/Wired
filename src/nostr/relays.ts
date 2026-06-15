import { DEFAULT_RELAYS } from "../config";
import { normalizeRelayUrl } from "@lib/quotedEvents";

export function relaysWithHints(hints: readonly string[] = []): string[] {
  return [
    ...new Set([
      ...DEFAULT_RELAYS,
      ...hints.map(normalizeRelayUrl),
    ]),
  ];
}