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
import type { ProcessedEvent, RelayHintsByEventId } from "../src/nostr/types.js";
import { isRootNote } from "../src/shared/lib/noteEvents.js";
import { extractMentionedEventRefs } from "../src/shared/lib/quotedEvents.js";
import {
  parseProfileEvent,
  type ProfileMetadata,
} from "../src/shared/lib/profile.js";

useWebSocketImplementation(WebSocket);

const PROFILE_RELAYS = [...THREAD_RELAYS];
const FEED_SNAPSHOT_RELAYS = [...THREAD_RELAYS];
const REPLY_RELAYS = [...THREAD_RELAYS];

const DEFAULT_TIMEOUT_MS = 12_000;
const REPLY_FETCH_DEPTH = 2;

type EventBatch = {
  events: Event[];
  relayHintsByEventId: Map<string, string[]>;
};

export type FeedBootstrapSnapshot = {
  fetchedAt: number;
  processedEvents: ProcessedEvent[];
  events: Event[];
  relayHintsByEventId: Record<string, string[]>;
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
  }
};

function normalizeRelayUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function uniqueRelays(relays: readonly string[]): string[] {
  return [...new Set(relays.map(normalizeRelayUrl).filter(Boolean))];
}

function addRelayHint(
  relayHintsByEventId: Map<string, string[]>,
  eventId: string,
  relayUrl: string,
): void {
  const normalizedRelay = normalizeRelayUrl(relayUrl);
  if (!normalizedRelay) return;

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

function mergeEvents(...eventGroups: Event[][]): Event[] {
  const merged = new Map<string, Event>();
  eventGroups.forEach((events) => {
    events.forEach((event) => merged.set(event.id, event));
  });
  return [...merged.values()];
}

function serializeRelayHints(
  relayHintsByEventId: RelayHintsByEventId,
): Record<string, string[]> {
  return Object.fromEntries(
    [...relayHintsByEventId.entries()].map(([eventId, relays]) => [
      eventId,
      uniqueRelays(relays),
    ]),
  );
}

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
): Promise<EventBatch> {
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

  return { events, relayHintsByEventId };
}

async function fetchGlobalFeedEvents(
  ageHours: number,
  timeoutMs: number,
): Promise<EventBatch> {
  const relays = await connectRelays(FEED_SNAPSHOT_RELAYS, timeoutMs);

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
      const nextParentIds: string[] = [];

      replyBatch.relayHintsByEventId.forEach((relays, eventId) => {
        relays.forEach((relay) => addRelayHint(replyRelayHintsByEventId, eventId, relay));
      });

      nextReplies.forEach((event) => {
        if (seenReplyIds.has(event.id)) return;

        seenReplyIds.add(event.id);
        replyEvents.push(event);
        nextParentIds.push(event.id);
      });

      parentIds = nextParentIds;
    }

    return {
      events: mergeEvents(rootEvents, replyEvents),
      relayHintsByEventId: mergeRelayHints(
        rootBatch.relayHintsByEventId,
        replyRelayHintsByEventId,
      ),
    };
  } finally {
    closeRelays(relays);
  }
}

function snapshotReferenceRefs(processedEvents: ProcessedEvent[]) {
  const byId = new Map<string, { id: string; relays: string[] }>();

  processedEvents.forEach((processed) => {
    extractMentionedEventRefs(processed.postEvent).forEach((ref) => {
      const existing = byId.get(ref.id);
      if (existing) {
        existing.relays = uniqueRelays([...existing.relays, ...ref.relays]);
        return;
      }
      byId.set(ref.id, { id: ref.id, relays: uniqueRelays(ref.relays) });
    });
  });

  return [...byId.values()];
}

async function fetchReferencedEvents(
  refs: ReturnType<typeof snapshotReferenceRefs>,
  knownEventIds: Set<string>,
  ageHours: number,
  timeoutMs: number,
): Promise<EventBatch> {
  const missingRefs = refs.filter((ref) => !knownEventIds.has(ref.id));
  if (missingRefs.length === 0) {
    return { events: [], relayHintsByEventId: new Map() };
  }

  const relayUrls = uniqueRelays([
    ...FEED_SNAPSHOT_RELAYS,
    ...missingRefs.flatMap((ref) => ref.relays),
  ]);
  const relays = await connectRelays(relayUrls, timeoutMs);

  try {
    const referencedBatch = await subscribeOnce(
      relays,
      {
        ids: missingRefs.map((ref) => ref.id),
        kinds: [1, 1068],
        limit: missingRefs.length,
      },
      timeoutMs,
      relayUrls,
    );

    const replyEvents: Event[] = [];
    const seenReplyIds = new Set<string>();
    const replyRelayHintsByEventId = new Map<string, string[]>();
    const since = sinceFromAgeHours(ageHours);
    let parentIds = referencedBatch.events.map((event) => event.id);

    const replyDepth = clampReplyDepth(REPLY_FETCH_DEPTH);
    for (let depth = 0; depth < replyDepth && parentIds.length > 0; depth += 1) {
      const replyFilter = buildReplyFilter(parentIds, since);
      if (!replyFilter) break;

      const replyBatch = await subscribeOnce(
        relays,
        replyFilter,
        timeoutMs,
        relayUrls,
      );
      const nextParentIds: string[] = [];

      replyBatch.relayHintsByEventId.forEach((relays, eventId) => {
        relays.forEach((relay) => addRelayHint(replyRelayHintsByEventId, eventId, relay));
      });

      replyBatch.events.forEach((event) => {
        if (knownEventIds.has(event.id) || seenReplyIds.has(event.id)) return;

        seenReplyIds.add(event.id);
        replyEvents.push(event);
        nextParentIds.push(event.id);
      });

      parentIds = nextParentIds;
    }

    return {
      events: mergeEvents(referencedBatch.events, replyEvents),
      relayHintsByEventId: mergeRelayHints(
        referencedBatch.relayHintsByEventId,
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

  const relays = await connectRelays(PROFILE_RELAYS, timeoutMs);

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
    processed.replies.forEach((reply) => pubkeys.add(reply.pubkey));
  });

  return [...pubkeys];
}

function pubkeysFromEvents(events: Event[]): string[] {
  return [...new Set(events.map((event) => event.pubkey))];
}

export async function fetchFeedSnapshot(
  options: FeedSnapshotOptions = {},
): Promise<FeedBootstrapSnapshot> {
  const ageHours = options.ageHours ?? BOOTSTRAP_AGE_HOURS;
  const filterDifficulty = options.filterDifficulty ?? BOOTSTRAP_FILTER_DIFFICULTY;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const feedBatch = await fetchGlobalFeedEvents(ageHours, timeoutMs);
  const processedEvents = processFeedEvents(
    feedBatch.events,
    filterDifficulty,
    feedBatch.relayHintsByEventId,
  );
  const knownEventIds = new Set(feedBatch.events.map((event) => event.id));
  const referencedBatch = await fetchReferencedEvents(
    snapshotReferenceRefs(processedEvents),
    knownEventIds,
    ageHours,
    timeoutMs,
  );
  const events = mergeEvents(feedBatch.events, referencedBatch.events);
  const relayHintsByEventId = mergeRelayHints(
    feedBatch.relayHintsByEventId,
    referencedBatch.relayHintsByEventId,
  );
  const profiles = await fetchProfileMetadata(
    [...new Set([
      ...pubkeysFromProcessedEvents(processedEvents),
      ...pubkeysFromEvents(referencedBatch.events),
    ])],
    timeoutMs,
  );

  return {
    fetchedAt: Date.now(),
    processedEvents,
    events,
    relayHintsByEventId: serializeRelayHints(relayHintsByEventId),
    profiles,
  };
}
