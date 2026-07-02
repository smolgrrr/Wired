import { Relay, type Event, type Filter, useWebSocketImplementation } from "nostr-tools";
import { WebSocket } from "ws";
import {
  POW_RELAYS,
  THREAD_RELAYS,
} from "../src/config.js";
import {
  BOOTSTRAP_AGE_HOURS,
  BOOTSTRAP_FILTER_DIFFICULTY,
} from "./feedBootstrap.js";
import {
  buildReplyFilter,
  clampReplyDepth,
  profileQueryLimit,
  sinceFromAgeHours,
} from "../src/nostr/subscriptions/query-limits.js";
import { processFeedEvents } from "../src/nostr/processEvents.js";
import type {
  ProcessedEvent,
  RelayHintsByEventId,
} from "../src/nostr/types.js";
import { isRootNote } from "../src/shared/lib/noteEvents.js";
import {
  parseProfileEvent,
  type ProfileMetadata,
} from "../src/shared/lib/profile.js";

useWebSocketImplementation(WebSocket);

const PROFILE_RELAYS = [...THREAD_RELAYS];
const FEED_SNAPSHOT_RELAYS = [...THREAD_RELAYS];
const REPLY_RELAYS = [...THREAD_RELAYS];

const DEFAULT_TIMEOUT_MS = 12_000;
const REPLY_FETCH_DEPTH = 3;

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

type RelayEventBatch = {
  events: Event[];
  relayHintsByEventId: Map<string, string[]>;
};

const trackRootNote = (notes: Set<string>, evt: Event) => {
  if (isRootNote(evt)) {
    notes.add(evt.id);
  }
};

function normalizeRelayUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function addRelayHint(
  relayHintsByEventId: Map<string, string[]>,
  eventId: string,
  relayUrl: string,
): void {
  const normalizedRelay = normalizeRelayUrl(relayUrl);
  const existing = relayHintsByEventId.get(eventId) ?? [];
  if (existing.includes(normalizedRelay)) return;

  relayHintsByEventId.set(eventId, [...existing, normalizedRelay]);
}

function mergeRelayHints(
  ...hintGroups: RelayHintsByEventId[]
): Map<string, string[]> {
  const merged = new Map<string, string[]>();

  hintGroups.forEach((relayHintsByEventId) => {
    relayHintsByEventId.forEach((relays, eventId) => {
      relays.forEach((relay) => addRelayHint(merged, eventId, relay));
    });
  });

  return merged;
}

async function connectRelays(urls: readonly string[]): Promise<Relay[]> {
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
): Promise<RelayEventBatch> {
  if (relays.length === 0) {
    return { events: [], relayHintsByEventId: new Map() };
  }

  const targetRelays = relayUrls
    ? relays.filter((relay) =>
        relayUrls.some(
          (url) => normalizeRelayUrl(url) === normalizeRelayUrl(relay.url),
        ),
      )
    : relays;

  if (targetRelays.length === 0) {
    return { events: [], relayHintsByEventId: new Map() };
  }

  const events: Event[] = [];
  const seenIds = new Set<string>();
  const relayHintsByEventId = new Map<string, string[]>();

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
          addRelayHint(relayHintsByEventId, event.id, relay.url);
          if (!seenIds.has(event.id)) {
            seenIds.add(event.id);
            events.push(event);
          }
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

  return { events, relayHintsByEventId };
}

async function fetchGlobalFeedEvents(
  ageHours: number,
  timeoutMs: number,
): Promise<RelayEventBatch> {
  const relays = await connectRelays(FEED_SNAPSHOT_RELAYS);

  try {
    const notes = new Set<string>();
    const since = sinceFromAgeHours(ageHours);

    const rootBatch = await subscribeOnce(
      relays,
      { kinds: [1, 1068], since, limit: 500 },
      timeoutMs,
      [...POW_RELAYS],
    );
    const rootEvents = rootBatch.events;

    rootEvents.forEach((event) => trackRootNote(notes, event));

    if (notes.size === 0) {
      return rootBatch;
    }

    const replyEvents: Event[] = [];
    const seenReplyIds = new Set<string>();
    const replyRelayHintsByEventId = new Map<string, string[]>();
    let parentIds = [...notes];

    const replyDepth = clampReplyDepth(REPLY_FETCH_DEPTH);
    for (let depth = 0; depth < replyDepth && parentIds.length > 0; depth += 1) {
      const replyFilter = buildReplyFilter(parentIds, since);
      if (!replyFilter) break;

      const replyBatch = await subscribeOnce(
        relays,
        replyFilter,
        timeoutMs,
        REPLY_RELAYS,
      );
      const nextReplies = replyBatch.events;
      replyBatch.relayHintsByEventId.forEach((relays, eventId) => {
        relays.forEach((relay) =>
          addRelayHint(replyRelayHintsByEventId, eventId, relay),
        );
      });
      const nextParentIds: string[] = [];

      nextReplies.forEach((event) => {
        if (seenReplyIds.has(event.id)) return;

        seenReplyIds.add(event.id);
        replyEvents.push(event);
        nextParentIds.push(event.id);
      });

      parentIds = nextParentIds;
    }

    const merged = new Map<string, Event>();
    [...rootEvents, ...replyEvents].forEach((event) => {
      merged.set(event.id, event);
    });

    return {
      events: [...merged.values()],
      relayHintsByEventId: mergeRelayHints(
        rootBatch.relayHintsByEventId,
        replyRelayHintsByEventId,
      ),
    };
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

  const relays = await connectRelays(PROFILE_RELAYS);

  try {
    const { events } = await subscribeOnce(
      relays,
      {
        authors: pubkeys,
        kinds: [0],
        limit: profileQueryLimit(pubkeys.length),
      },
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
    pubkeys.add(processed.postEvent.pubkey);
  });

  return [...pubkeys];
}

export async function fetchFeedSnapshot(
  options: FeedSnapshotOptions = {},
): Promise<FeedBootstrapSnapshot> {
  const ageHours = options.ageHours ?? BOOTSTRAP_AGE_HOURS;
  const filterDifficulty = options.filterDifficulty ?? BOOTSTRAP_FILTER_DIFFICULTY;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const { events, relayHintsByEventId } = await fetchGlobalFeedEvents(
    ageHours,
    timeoutMs,
  );
  const processedEvents = processFeedEvents(
    events,
    filterDifficulty,
    relayHintsByEventId,
  );
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
