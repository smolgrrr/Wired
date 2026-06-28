export const DEFAULT_DIFFICULTY = 16;

export const DEFAULT_RELAYS = [
  "wss://powrelay.xyz",
  "wss://pow.relays.land",
] as const;

export const POW_RELAYS = DEFAULT_RELAYS;

export const ENRICHMENT_RELAYS = [
  "wss://relay.damus.io",
  "wss://offchain.pub",
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://relay.nostr.band",
  "wss://nostr.wine",
  "wss://relay.snort.social",
] as const;

export const QUOTE_FALLBACK_RELAYS = ENRICHMENT_RELAYS;

export const THREAD_RELAYS = [
  ...new Set([...POW_RELAYS, ...ENRICHMENT_RELAYS]),
] as const;
