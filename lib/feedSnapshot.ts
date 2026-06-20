import { Relay, type Event, type Filter, useWebSocketImplementation } from "nostr-tools";
import { WebSocket } from "ws";
import {
  DEFAULT_RELAYS,
  QUOTE_FALLBACK_RELAYS,
} from "../src/config.js";
import {
  BOOTSTRAP_AGE_HOURS,
  BOOTSTRAP_FILTER_DIFFICULTY,
} from "./feedBootstrap.js";
import { processFeedEvents } from "../src/nostr/processEvents.js";
import type { ProcessedEvent } from "../src/nostr/types.js";
import { parseRepost } from "../src/nostr/processing/repost.js";
import { isRootNote } from "../src/shared/lib/noteEvents.js";
import {
  parseProfileEvent,
  type ProfileMetadata,
} from "../src/shared/lib/profile.js";

useWebSocketImplementation(WebSocket);

const PROFILE_RELAYS = [
  ...new Set([...DEFAULT_RELAYS, ...QUOTE_FALLBACK_RELAYS]),
] as string[];

const DEFAULT_TIMEOUT_MS = 12_000;

export type FeedBootstrapSnapshot = {
  fetchedAt: number;
  processedEvents: ProcessedEvent[];
  profiles: Record<string, ProfileMetadata>;
};

export type FeedSnapshotOptions = {
  ageHours?: number;
  filterDifficulty?: number;
  timeoutMs?: number;
};

const trackRootNote = (notes: Set<string>, evt: Event) => {
  if (isRootNote(evt)) {
    notes.add(evt.id);
    return;
  }

  if (evt.kind === 6) {
    const reposted = parseRepost(evt);
    if (reposted?.kind === 1) {
      notes.add(reposted.id);
    }
  }
};

async function connectRelays(urls: readonly string[], timeoutMs: number): Promise<Relay[]> {
  const relays = await Promise.all(
    urls.map(async (url) => {
      try {
        return await Relay.connect(url);
      } catch {
        return null;
      }
    }),
  );

  return relays.filter((relay): relay is Relay => relay !== null);
}

function closeRelays(relays: Relay[]): void {
  relays.forEach((relay) => {
    try {
      relay.close();
    } catch {
      // Relay already closed.
    }
  });
}

async function subscribeOnce(
  relays: Relay[],
  filter: Filter,
  timeoutMs: number,
  relayUrls?: string[],
): Promise<Event[]> {
  if (relays.length === 0) {
    return [];
  }

  const targetRelays = relayUrls
    ? relays.filter((relay) => relayUrls.includes(relay.url))
    : relays;

  if (targetRelays.length === 0) {
    return [];
  }

  const events: Event[] = [];
  const seenIds = new Set<string>();

  await new Promise<void>((resolve) => {
    const subscriptions: { close: () => void }[] = [];
    let eoseCount = 0;
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subscriptions.forEach((sub) => sub.close());
      resolve();
    };

    const timer = setTimeout(finish, timeoutMs);

    for (const relay of targetRelays) {
      const sub = relay.subscribe([filter], {
        onevent(event) {
          if (seenIds.has(event.id)) return;
          seenIds.add(event.id);
          events.push(event);
        },
        oneose: () => {
          eoseCount += 1;
          if (eoseCount >= targetRelays.length) {
            finish();
          }
        },
      });
      subscriptions.push(sub);
    }
  });

  return events;
}

async function fetchGlobalFeedEvents(
  ageHours: number,
  timeoutMs: number,
): Promise<Event[]> {
  const relays = await connectRelays(DEFAULT_RELAYS, timeoutMs);

  try {
    const notes = new Set<string>();
    const now = Math.floor(Date.now() / 1000);
    const since = now - ageHours * 60 * 60;

    const rootEvents = await subscribeOnce(
      relays,
      { kinds: [1, 6, 1068], since, limit: 500 },
      timeoutMs,
    );

    rootEvents.forEach((event) => trackRootNote(notes, event));

    if (notes.size === 0) {
      return rootEvents;
    }

    const replyEvents = await subscribeOnce(
      relays,
      { "#e": [...notes], kinds: [1] },
      timeoutMs,
    );

    const merged = new Map<string, Event>();
    [...rootEvents, ...replyEvents].forEach((event) => {
      merged.set(event.id, event);
    });

    return [...merged.values()];
  } finally {
    closeRelays(relays);
  }
}

async function fetchProfileMetadata(
  pubkeys: string[],
  timeoutMs: number,
): Promise<Record<string, ProfileMetadata>> {
  if (pubkeys.length === 0) {
    return {};
  }

  const relays = await connectRelays(PROFILE_RELAYS, timeoutMs);

  try {
    const events = await subscribeOnce(
      relays,
      { authors: pubkeys, kinds: [0] },
      timeoutMs,
      PROFILE_RELAYS,
    );

    const profiles: Record<string, { profile: ProfileMetadata; createdAt: number }> =
      {};

    events.forEach((event) => {
      const profile = parseProfileEvent(event);
      if (!profile) return;

      const existing = profiles[event.pubkey];
      if (existing && existing.createdAt >= event.created_at) return;

      profiles[event.pubkey] = {
        profile,
        createdAt: event.created_at,
      };
    });

    return Object.fromEntries(
      Object.entries(profiles).map(([pubkey, entry]) => [pubkey, entry.profile]),
    );
  } finally {
    closeRelays(relays);
  }
}

function pubkeysFromProcessedEvents(processedEvents: ProcessedEvent[]): string[] {
  const pubkeys = new Set<string>();

  processedEvents.forEach((processed) => {
    const displayed = parseRepost(processed.postEvent);
    if (displayed?.pubkey) {
      pubkeys.add(displayed.pubkey);
    }
  });

  return [...pubkeys];
}

export async function fetchFeedSnapshot(
  options: FeedSnapshotOptions = {},
): Promise<FeedBootstrapSnapshot> {
  const ageHours = options.ageHours ?? BOOTSTRAP_AGE_HOURS;
  const filterDifficulty = options.filterDifficulty ?? BOOTSTRAP_FILTER_DIFFICULTY;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const events = await fetchGlobalFeedEvents(ageHours, timeoutMs);
  const processedEvents = processFeedEvents(events, filterDifficulty);
  const profiles = await fetchProfileMetadata(
    pubkeysFromProcessedEvents(processedEvents),
    timeoutMs,
  );

  return {
    fetchedAt: Date.now(),
    processedEvents,
    profiles,
  };
}

