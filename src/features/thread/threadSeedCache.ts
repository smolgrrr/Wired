import type { Event } from "nostr-tools";

const THREAD_SEED_PREFIX = "threadSeed:";

type ThreadSeed = {
  events: Event[];
};

function storageKey(threadId: string): string {
  return `${THREAD_SEED_PREFIX}${threadId}`;
}

function getSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function isEvent(value: unknown): value is Event {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<Event>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.pubkey === "string" &&
    typeof candidate.created_at === "number" &&
    typeof candidate.kind === "number" &&
    Array.isArray(candidate.tags) &&
    typeof candidate.content === "string" &&
    typeof candidate.sig === "string"
  );
}

function parseThreadSeed(value: string | null): Event[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as Partial<ThreadSeed>;
    return Array.isArray(parsed.events) ? parsed.events.filter(isEvent) : [];
  } catch {
    return [];
  }
}

export function readThreadSeedEvents(threadId: string): Event[] {
  return parseThreadSeed(getSessionStorage()?.getItem(storageKey(threadId)) ?? null);
}

export function writeThreadSeedEvents(threadId: string, events: Event[]): void {
  const storage = getSessionStorage();
  if (!storage) return;

  const seed: ThreadSeed = {
    events: events.filter(isEvent),
  };

  try {
    storage.setItem(storageKey(threadId), JSON.stringify(seed));
  } catch {
    // Seed persistence is an optimization; navigation should still work.
  }
}
