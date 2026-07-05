export const DEFAULT_DIFFICULTY = 16;

export const DEFAULT_RELAYS = [
  "wss://relay.wiredsignal.online",
  "wss://powrelay.xyz",
  "wss://pow.relays.land",
] as const;

export const DEFAULT_ENRICHMENT_RELAYS = [
  "wss://relay.damus.io",
  "wss://offchain.pub",
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://relay.nostr.band",
  "wss://nostr.wine",
  "wss://relay.snort.social",
] as const;

export function configuredRelays(
  envValue: string | undefined,
  fallback: readonly string[],
) {
  if (!envValue?.trim()) return fallback;

  const relays = envValue
    .split(",")
    .map((relay) => relay.trim())
    .filter((relay) => relay.startsWith("wss://"));

  return relays.length > 0 ? relays : fallback;
}

function configuredEnv(key: string): string | undefined {
  const viteEnv = import.meta.env as Record<string, string | undefined> | undefined;
  if (viteEnv?.[key] !== undefined) return viteEnv[key];

  if (typeof process !== "undefined") {
    return process.env[key];
  }

  return undefined;
}

export const POW_RELAYS = configuredRelays(
  configuredEnv("VITE_POW_RELAYS"),
  DEFAULT_RELAYS,
);

export const ENRICHMENT_RELAYS = configuredRelays(
  configuredEnv("VITE_ENRICHMENT_RELAYS"),
  DEFAULT_ENRICHMENT_RELAYS,
);

export const QUOTE_FALLBACK_RELAYS = [
  ...new Set([...DEFAULT_ENRICHMENT_RELAYS, ...ENRICHMENT_RELAYS]),
] as const;

export const THREAD_RELAYS = [
  ...new Set([...POW_RELAYS, ...ENRICHMENT_RELAYS]),
] as const;

export const CONFESS_API_BASE = (configuredEnv("VITE_CONFESS_API_BASE") || "")
  .trim()
  .replace(/\/+$/, "");
