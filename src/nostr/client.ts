import type { Event } from "nostr-tools";
import { DEFAULT_RELAYS, QUOTE_FALLBACK_RELAYS } from "../config";
import { RelayPool } from "./relay-pool";
import { SubscriptionRegistry } from "./subscription-registry";

let pool: RelayPool | null = null;
let registry: SubscriptionRegistry | null = null;
let connectPromise: Promise<void> | null = null;

export const THREAD_RELAYS = [
  ...new Set([...DEFAULT_RELAYS, ...QUOTE_FALLBACK_RELAYS]),
] as string[];

export const PROFILE_RELAYS = THREAD_RELAYS;

function ensureNostrClient(): void {
  if (!pool) {
    pool = new RelayPool();
    registry = new SubscriptionRegistry(pool);
  }
}

export function initNostr(): Promise<void> {
  ensureNostrClient();
  if (!pool) {
    throw new Error("Nostr client failed to initialize.");
  }

  if (!connectPromise) {
    connectPromise = Promise.all([
      pool.connect(DEFAULT_RELAYS),
      pool.ensureConnected(QUOTE_FALLBACK_RELAYS),
    ]).then(() => {});
  }

  return connectPromise;
}

export function getRegistry(): SubscriptionRegistry {
  ensureNostrClient();
  if (!registry) {
    throw new Error("Nostr client is not initialized. Wrap the app in NostrProvider.");
  }
  return registry;
}

export async function ensureRelaysConnected(urls: readonly string[]): Promise<void> {
  await initNostr();
  if (!pool) {
    throw new Error("Nostr client is not initialized.");
  }
  await pool.ensureConnected(urls);
}

export async function publish(event: Event): Promise<Set<string>> {
  await initNostr();
  if (!pool) {
    throw new Error("Nostr client is not initialized.");
  }
  return pool.publish(event);
}

export function isNostrReady(): boolean {
  return pool?.isConnected ?? false;
}

export function closeAllSubscriptions(): void {
  registry?.closeAll();
}