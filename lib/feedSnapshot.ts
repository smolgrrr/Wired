import { type Event, type Filter, useWebSocketImplementation } from "nostr-tools";
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
import {
  buildFeedEventMap,
  ROOT_RESOLUTION_DEPTH,
  feedRootRefsFromQualifyingActivity,
  isFeedThreadRootEvent,
  mergeFeedRootRefs,
  planFeedRootResolution,
  resolveFeedRootRef,
  type FeedRootRef,
} from "../src/nostr/feed-candidates.js";
import { extractMentionedEventRefs } from "../src/shared/lib/quotedEvents.js";
import {
  parseProfileEvent,
  type ProfileMetadata,
} from "../src/shared/lib/profile.js";
import type {
  FeedBootstrapProcessedEvent,
  FeedBootstrapSnapshot,
} from "../src/shared/lib/feedBootstrapTypes.js";
import {
  withFiniteRelaySession,
  type FiniteRelaySession,
} from "./serverRelaySession.js";

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

type FeedEventBatch = EventBatch & {
  activityRootIds: string[];
};

export type { FeedBootstrapSnapshot };

export type FeedSnapshotOptions = {
  ageHours?: number;
  filterDifficulty?: number;
  relayCoverage?: {
    snapshot: readonly string[];
    pow: readonly string[];
    replies: readonly string[];
    profiles: readonly string[];
  };
  timeoutMs?: number;
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

async function querySessionOnce(
  session: FiniteRelaySession,
  filter: Filter,
  timeoutMs: number,
  relayUrls?: readonly string[],
): Promise<EventBatch> {
  const events: Event[] = [];
  const seenIds = new Set<string>();
  const relayHintsByEventId = new Map<string, string[]>();

  await session.query({
    filters: [filter],
    relayUrls,
    deadlineMs: timeoutMs,
    onEvent(event, relayUrl) {
      addRelayHint(relayHintsByEventId, event.id, relayUrl);
      if (seenIds.has(event.id)) return;
      seenIds.add(event.id);
      events.push(event);
    },
  });

  return { events, relayHintsByEventId };
}

async function fetchRootEvents(
  session: FiniteRelaySession,
  rootRefs: FeedRootRef[],
  knownEvents: Event[],
  timeoutMs: number,
  snapshotRelayUrls: readonly string[],
): Promise<EventBatch> {
  if (rootRefs.length === 0) {
    return { events: [], relayHintsByEventId: new Map() };
  }

  const events: Event[] = [];
  const eventsById = buildFeedEventMap(knownEvents);
  const relayHintsByEventId = new Map<string, string[]>();
  const requestedIds = new Set<string>();
  let refsToResolve = mergeFeedRootRefs(rootRefs);

  for (
    let depth = 0;
    depth < ROOT_RESOLUTION_DEPTH && refsToResolve.length > 0;
    depth += 1
  ) {
    const { refsToFetch: pendingRefs } = planFeedRootResolution(
      refsToResolve,
      eventsById,
      requestedIds,
    );
    if (pendingRefs.length === 0) break;

    pendingRefs.forEach((ref) => requestedIds.add(ref.id));

    const relayUrls = uniqueRelays([
      ...snapshotRelayUrls,
      ...pendingRefs.flatMap((ref) => ref.relays),
    ]);
    await session.ensureRelays(relayUrls, timeoutMs);
    const nextRefs: FeedRootRef[] = [];
    const ids = pendingRefs.map((ref) => ref.id);
    const batch = await querySessionOnce(
      session,
      {
        ids,
        kinds: [1],
        limit: ids.length,
      },
      timeoutMs,
      relayUrls,
    );

    events.push(...batch.events);
    batch.events.forEach((event) => {
      eventsById.set(event.id.toLowerCase(), event);
      const nextRef = resolveFeedRootRef(event, eventsById);
      if (nextRef && nextRef.id !== event.id.toLowerCase()) {
        nextRefs.push(nextRef);
      }
    });
    batch.relayHintsByEventId.forEach((relaysForEvent, eventId) => {
      relaysForEvent.forEach((relay) =>
        addRelayHint(relayHintsByEventId, eventId, relay),
      );
    });

    refsToResolve = mergeFeedRootRefs(nextRefs);
  }

  return { events, relayHintsByEventId };
}

async function fetchGlobalFeedEvents(
  ageHours: number,
  filterDifficulty: number,
  timeoutMs: number,
  relayUrls: {
    pow: readonly string[];
    replies: readonly string[];
    snapshot: readonly string[];
  },
): Promise<FeedEventBatch> {
  const sessionRelayUrls = uniqueRelays([
    ...relayUrls.snapshot,
    ...relayUrls.pow,
    ...relayUrls.replies,
  ]);
  return withFiniteRelaySession(
    { relayUrls: sessionRelayUrls, connectDeadlineMs: timeoutMs },
    async (session) => {
      const since = sinceFromAgeHours(ageHours);

      const activityBatch = await querySessionOnce(
        session,
        { kinds: [1], since, limit: 500 },
        timeoutMs,
        [...relayUrls.pow],
      );
      const activityEvents = activityBatch.events;
      const activityRootRefs = feedRootRefsFromQualifyingActivity(
        activityEvents,
        filterDifficulty,
      );

      if (activityRootRefs.length === 0) {
        return { ...activityBatch, activityRootIds: [] };
      }

      const resolvedRootBatch = await fetchRootEvents(
        session,
        activityRootRefs,
        activityEvents,
        timeoutMs,
        relayUrls.snapshot,
      );
      const seedEvents = mergeEvents(activityEvents, resolvedRootBatch.events);
      const seedEventsById = buildFeedEventMap(seedEvents);
      const rootRefs = feedRootRefsFromQualifyingActivity(
        activityEvents,
        filterDifficulty,
        seedEventsById,
      );
      const rootIds = rootRefs
        .map((ref) => seedEventsById.get(ref.id))
        .filter((event): event is Event => !!event && isFeedThreadRootEvent(event))
        .map((event) => event.id.toLowerCase());
      const replyEvents: Event[] = [];
      const seenReplyIds = new Set<string>();
      const replyRelayHintsByEventId = new Map<string, string[]>();
      let parentIds = [...new Set(rootIds)];

      const replyDepth = clampReplyDepth(REPLY_FETCH_DEPTH);
      for (let depth = 0; depth < replyDepth && parentIds.length > 0; depth += 1) {
        const replyFilter = buildReplyFilter(parentIds, since);
        if (!replyFilter) break;

        const replyBatch = await querySessionOnce(
          session,
          replyFilter,
          timeoutMs,
          [...relayUrls.replies],
        );
        const nextReplies = replyBatch.events;
        const nextParentIds: string[] = [];

        replyBatch.relayHintsByEventId.forEach((relays, eventId) => {
          relays.forEach((relay) =>
            addRelayHint(replyRelayHintsByEventId, eventId, relay),
          );
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
        events: mergeEvents(activityEvents, resolvedRootBatch.events, replyEvents),
        relayHintsByEventId: mergeRelayHints(
          activityBatch.relayHintsByEventId,
          resolvedRootBatch.relayHintsByEventId,
          replyRelayHintsByEventId,
        ),
        activityRootIds: rootRefs.map((ref) => ref.id),
      };
    },
  );
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
  snapshotRelayUrls: readonly string[],
): Promise<EventBatch> {
  const missingRefs = refs.filter((ref) => !knownEventIds.has(ref.id));
  if (missingRefs.length === 0) {
    return { events: [], relayHintsByEventId: new Map() };
  }

  const configuredRelayUrls = uniqueRelays(snapshotRelayUrls);
  const hintedRelayUrls = uniqueRelays(
    missingRefs.flatMap((ref) => ref.relays),
  ).filter((relayUrl) => !configuredRelayUrls.includes(relayUrl));
  const relayUrls = uniqueRelays([...configuredRelayUrls, ...hintedRelayUrls]);

  return withFiniteRelaySession(
    { relayUrls: configuredRelayUrls, connectDeadlineMs: timeoutMs },
    async (session) => {
      const hintedConnections = session.ensureRelays(hintedRelayUrls, timeoutMs);
      const configuredBatch = await querySessionOnce(
        session,
        {
          ids: missingRefs.map((ref) => ref.id),
          kinds: [1, 1068],
          limit: missingRefs.length,
        },
        timeoutMs,
        configuredRelayUrls,
      );
      const foundIds = new Set(configuredBatch.events.map((event) => event.id));
      const stillMissingRefs = missingRefs.filter((ref) => !foundIds.has(ref.id));
      const hintedBatches: EventBatch[] = [];

      if (stillMissingRefs.length > 0 && hintedRelayUrls.length > 0) {
        await hintedConnections;
        const missingIdsByRelay = new Map<string, string[]>();
        stillMissingRefs.forEach((ref) => {
          uniqueRelays(ref.relays).forEach((relayUrl) => {
            if (!hintedRelayUrls.includes(relayUrl)) return;
            const ids = missingIdsByRelay.get(relayUrl) ?? [];
            if (!ids.includes(ref.id)) ids.push(ref.id);
            missingIdsByRelay.set(relayUrl, ids);
          });
        });
        hintedBatches.push(...await Promise.all(
          [...missingIdsByRelay].map(([relayUrl, ids]) => querySessionOnce(
            session,
            {
              ids,
              kinds: [1, 1068],
              limit: ids.length,
            },
            timeoutMs,
            [relayUrl],
          )),
        ));
      }

      const referencedBatch: EventBatch = {
        events: mergeEvents(
          configuredBatch.events,
          ...hintedBatches.map((batch) => batch.events),
        ),
        relayHintsByEventId: mergeRelayHints(
          configuredBatch.relayHintsByEventId,
          ...hintedBatches.map((batch) => batch.relayHintsByEventId),
        ),
      };
      const replyEvents: Event[] = [];
      const seenReplyIds = new Set<string>();
      const replyRelayHintsByEventId = new Map<string, string[]>();
      const since = sinceFromAgeHours(ageHours);
      let parentIds = referencedBatch.events.map((event) => event.id);

      const replyDepth = clampReplyDepth(REPLY_FETCH_DEPTH);
      for (let depth = 0; depth < replyDepth && parentIds.length > 0; depth += 1) {
        const replyFilter = buildReplyFilter(parentIds, since);
        if (!replyFilter) break;

        const replyBatch = await querySessionOnce(
          session,
          replyFilter,
          timeoutMs,
          relayUrls,
        );
        const nextParentIds: string[] = [];

        replyBatch.relayHintsByEventId.forEach((relays, eventId) => {
          relays.forEach((relay) =>
            addRelayHint(replyRelayHintsByEventId, eventId, relay),
          );
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
    },
  );
}

async function fetchProfileMetadata(
  pubkeys: string[],
  timeoutMs: number,
  profileRelayUrls: readonly string[],
): Promise<Record<string, ProfileMetadata>> {
  if (pubkeys.length === 0) {
    return {};
  }

  return withFiniteRelaySession(
    { relayUrls: profileRelayUrls, connectDeadlineMs: timeoutMs },
    async (session) => {
      const { events } = await querySessionOnce(
        session,
        {
          authors: pubkeys,
          kinds: [0],
          limit: profileQueryLimit(pubkeys.length),
        },
        timeoutMs,
        profileRelayUrls,
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
    },
  );
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

function eventsById(events: Event[]): Record<string, Event> {
  return Object.fromEntries(
    mergeEvents(events).map((event) => [event.id.toLowerCase(), event]),
  );
}

function serializeProcessedEvents(
  processedEvents: ProcessedEvent[],
): FeedBootstrapProcessedEvent[] {
  return processedEvents.map((processed) => {
    const serialized: FeedBootstrapProcessedEvent = {
      postEventId: processed.postEvent.id.toLowerCase(),
      replyIds: processed.replies.map((reply) => reply.id.toLowerCase()),
      threadReplyCount: processed.threadReplyCount ?? processed.replies.length,
      rootWork: processed.rootWork ?? 0,
      replyWork: processed.replyWork ?? 0,
      totalWork: processed.totalWork,
      rankingReplyCount: processed.rankingReplyCount ?? 0,
    };
    if (processed.relayHints && processed.relayHints.length > 0) {
      serialized.relayHints = processed.relayHints;
    }
    return serialized;
  });
}

export async function fetchFeedSnapshot(
  options: FeedSnapshotOptions = {},
): Promise<FeedBootstrapSnapshot> {
  const ageHours = options.ageHours ?? BOOTSTRAP_AGE_HOURS;
  const filterDifficulty = options.filterDifficulty ?? BOOTSTRAP_FILTER_DIFFICULTY;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const snapshotRelayUrls = options.relayCoverage?.snapshot ?? FEED_SNAPSHOT_RELAYS;
  const powRelayUrls = options.relayCoverage?.pow ?? POW_RELAYS;
  const replyRelayUrls = options.relayCoverage?.replies ?? REPLY_RELAYS;
  const profileRelayUrls = options.relayCoverage?.profiles ?? PROFILE_RELAYS;

  const feedBatch = await fetchGlobalFeedEvents(
    ageHours,
    filterDifficulty,
    timeoutMs,
    {
      pow: powRelayUrls,
      replies: replyRelayUrls,
      snapshot: snapshotRelayUrls,
    },
  );
  const processedEvents = processFeedEvents(
    feedBatch.events,
    filterDifficulty,
    feedBatch.relayHintsByEventId,
    { activityRootIds: feedBatch.activityRootIds },
  );
  const knownEventIds = new Set(feedBatch.events.map((event) => event.id));
  const referencedBatch = await fetchReferencedEvents(
    snapshotReferenceRefs(processedEvents),
    knownEventIds,
    ageHours,
    timeoutMs,
    snapshotRelayUrls,
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
    profileRelayUrls,
  );

  return {
    fetchedAt: Date.now(),
    processedEvents: serializeProcessedEvents(processedEvents),
    eventsById: eventsById(events),
    relayHintsByEventId: serializeRelayHints(relayHintsByEventId),
    profiles,
    scoring: {
      ageHours,
      minPow: filterDifficulty,
      replyDepth: REPLY_FETCH_DEPTH,
      sort: "totalWork",
    },
  };
}
