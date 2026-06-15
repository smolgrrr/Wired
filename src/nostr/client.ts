import type { Event } from "nostr-tools";
import { DEFAULT_RELAYS } from "../config";
import { RelayPool } from "./relay-pool";
import { SubscriptionRegistry } from "./subscription-registry";

let pool: RelayPool | null = null;
let registry: SubscriptionRegistry | null = null;
let connectPromise: Promise<void> | null = null;

export function initNostr(relayUrls: readonly string[] = DEFAULT_RELAYS): Promise<void> {
  if (!connectPromise) {
    pool = new RelayPool();
    registry = new SubscriptionRegistry(pool);
    connectPromise = pool.connect(relayUrls);
  }

  return connectPromise;
}

export function getRegistry(): SubscriptionRegistry {
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