import { type Event, type Filter, useWebSocketImplementation } from "nostr-tools";
import { WebSocket } from "ws";
import {
  COMPLETE_WIRED_SNAPSHOT_TRAVERSAL_ENABLED,
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
  type QueryCompletion,
} from "./serverRelaySession.js";
import {
  snapshotQueryIncompleteReason,
  traverseCompleteSnapshotReplies,
  type SnapshotReplyTraversalIncompleteReason,
  type SnapshotReplyTraversalCompletion,
} from "./completeSnapshotReplyTraversal.js";

useWebSocketImplementation(WebSocket);

const PROFILE_RELAYS = [...THREAD_RELAYS];
const FEED_SNAPSHOT_RELAYS = [...THREAD_RELAYS];
const REPLY_RELAYS = [...THREAD_RELAYS];

const DEFAULT_TIMEOUT_MS = 12_000;
const REPLY_FETCH_DEPTH = 2;

type EventBatch = {
  events: Event[];
  relayHintsByEventId: Map<string, string[]>;
  queryCompletions: QueryCompletion[];
  replyTraversalCompletion?: SnapshotReplyTraversalCompletion;
};

type FeedEventBatch = EventBatch & {
  activityRootIds: string[];
  finitePhases: FeedSnapshotFinitePhaseCompletion[];
};

export type { FeedBootstrapSnapshot };

export type FeedSnapshotTraversalPhase =
  | "activity"
  | "root-resolution"
  | "references"
  | "profiles"
  | "feed-replies"
  | "reference-replies";

export type FeedSnapshotFinitePhaseCompletion = {
  phase: Exclude<
    FeedSnapshotTraversalPhase,
    "feed-replies" | "reference-replies"
  >;
  queries: readonly QueryCompletion[];
};

export type FeedSnapshotTraversalCompletion =
  | {
      state: "complete";
      finitePhases: readonly FeedSnapshotFinitePhaseCompletion[];
      feedReplies: SnapshotReplyTraversalCompletion;
      referenceReplies: SnapshotReplyTraversalCompletion;
    }
  | {
      state: "incomplete";
      phase: FeedSnapshotTraversalPhase;
      reason: SnapshotReplyTraversalIncompleteReason;
      finitePhases: readonly FeedSnapshotFinitePhaseCompletion[];
      feedReplies?: SnapshotReplyTraversalCompletion;
      referenceReplies?: SnapshotReplyTraversalCompletion;
    };

export class IncompleteFeedSnapshotTraversalError extends Error {
  constructor(
    readonly completion: Extract<
      FeedSnapshotTraversalCompletion,
      { state: "incomplete" }
    >,
  ) {
    super(
      `Incomplete Wired snapshot traversal: ${completion.phase} ${completion.reason}`,
    );
    this.name = "IncompleteFeedSnapshotTraversalError";
  }
}

export type FeedSnapshotOptions = {
  ageHours?: number;
  completeTraversal?: boolean;
  filterDifficulty?: number;
  onTraversalComplete?: (
    completion: FeedSnapshotTraversalCompletion,
  ) => void;
  relayCoverage?: {
    snapshot: readonly string[];
    pow: readonly string[];
    replies: readonly string[];
    profiles: readonly string[];
  };
  signal?: AbortSignal;
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

function emptyReplyTraversalCompletion(): SnapshotReplyTraversalCompletion {
  return {
    state: "complete",
    passes: 0,
    queries: 0,
    parentCount: 0,
  };
}

function incompleteFinitePhase(
  finitePhases: readonly FeedSnapshotFinitePhaseCompletion[],
): {
  phase: FeedSnapshotFinitePhaseCompletion["phase"];
  reason: SnapshotReplyTraversalIncompleteReason;
} | null {
  for (const phase of finitePhases) {
    for (const completion of phase.queries) {
      const reason = snapshotQueryIncompleteReason(completion);
      if (reason) return { phase: phase.phase, reason };
    }
  }
  return null;
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

  const completion = await session.query({
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

  return {
    events,
    relayHintsByEventId,
    queryCompletions: [completion],
  };
}

async function fetchRootEvents(
  session: FiniteRelaySession,
  rootRefs: FeedRootRef[],
  knownEvents: Event[],
  timeoutMs: number,
  snapshotRelayUrls: readonly string[],
): Promise<EventBatch> {
  if (rootRefs.length === 0) {
    return {
      events: [],
      relayHintsByEventId: new Map(),
      queryCompletions: [],
    };
  }

  const events: Event[] = [];
  const queryCompletions: QueryCompletion[] = [];
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
    queryCompletions.push(...batch.queryCompletions);

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

  return { events, relayHintsByEventId, queryCompletions };
}

async function fetchGlobalFeedEvents(
  ageHours: number,
  filterDifficulty: number,
  timeoutMs: number,
  completeTraversal: boolean,
  relayUrls: {
    pow: readonly string[];
    replies: readonly string[];
    snapshot: readonly string[];
  },
  signal?: AbortSignal,
): Promise<FeedEventBatch> {
  const sessionRelayUrls = uniqueRelays([
    ...relayUrls.snapshot,
    ...relayUrls.pow,
    ...relayUrls.replies,
  ]);
  return withFiniteRelaySession(
    { relayUrls: sessionRelayUrls, connectDeadlineMs: timeoutMs, signal },
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
        const replyTraversalCompletion = completeTraversal
          ? (await traverseCompleteSnapshotReplies({
              session,
              initialParentIds: [],
              relayUrls: relayUrls.replies,
              since,
              deadlineMs: timeoutMs,
              signal,
            })).completion
          : undefined;
        return {
          ...activityBatch,
          activityRootIds: [],
          finitePhases: [
            { phase: "activity", queries: activityBatch.queryCompletions },
            { phase: "root-resolution", queries: [] },
          ],
          replyTraversalCompletion,
        };
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
      if (completeTraversal) {
        const replyTraversal = await traverseCompleteSnapshotReplies({
          session,
          initialParentIds: rootIds,
          knownEventIds: seedEvents.map((event) => event.id),
          relayUrls: relayUrls.replies,
          since,
          deadlineMs: timeoutMs,
          signal,
        });
        return {
          events: mergeEvents(
            activityEvents,
            resolvedRootBatch.events,
            replyTraversal.events,
          ),
          relayHintsByEventId: mergeRelayHints(
            activityBatch.relayHintsByEventId,
            resolvedRootBatch.relayHintsByEventId,
            replyTraversal.relayHintsByEventId,
          ),
          activityRootIds: rootRefs.map((ref) => ref.id),
          queryCompletions: [
            ...activityBatch.queryCompletions,
            ...resolvedRootBatch.queryCompletions,
          ],
          finitePhases: [
            { phase: "activity", queries: activityBatch.queryCompletions },
            {
              phase: "root-resolution",
              queries: resolvedRootBatch.queryCompletions,
            },
          ],
          replyTraversalCompletion: replyTraversal.completion,
        };
      }

      const replyEvents: Event[] = [];
      const seenReplyIds = new Set<string>();
      const replyRelayHintsByEventId = new Map<string, string[]>();
      const replyQueryCompletions: QueryCompletion[] = [];
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
        replyQueryCompletions.push(...replyBatch.queryCompletions);
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
        queryCompletions: [
          ...activityBatch.queryCompletions,
          ...resolvedRootBatch.queryCompletions,
          ...replyQueryCompletions,
        ],
        finitePhases: [
          { phase: "activity", queries: activityBatch.queryCompletions },
          {
            phase: "root-resolution",
            queries: resolvedRootBatch.queryCompletions,
          },
        ],
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
  completeTraversal: boolean,
  signal?: AbortSignal,
): Promise<EventBatch> {
  const missingRefs = refs.filter((ref) => !knownEventIds.has(ref.id));
  if (missingRefs.length === 0) {
    return {
      events: [],
      relayHintsByEventId: new Map(),
      queryCompletions: [],
      replyTraversalCompletion: completeTraversal
        ? emptyReplyTraversalCompletion()
        : undefined,
    };
  }

  const configuredRelayUrls = uniqueRelays(snapshotRelayUrls);
  const hintedRelayUrls = uniqueRelays(
    missingRefs.flatMap((ref) => ref.relays),
  ).filter((relayUrl) => !configuredRelayUrls.includes(relayUrl));
  const relayUrls = uniqueRelays([...configuredRelayUrls, ...hintedRelayUrls]);

  return withFiniteRelaySession(
    {
      relayUrls: configuredRelayUrls,
      connectDeadlineMs: timeoutMs,
      signal,
    },
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
        queryCompletions: [
          ...configuredBatch.queryCompletions,
          ...hintedBatches.flatMap((batch) => batch.queryCompletions),
        ],
      };
      if (completeTraversal) {
        const replyTraversal = await traverseCompleteSnapshotReplies({
          session,
          initialParentIds: referencedBatch.events.map((event) => event.id),
          knownEventIds: [
            ...knownEventIds,
            ...referencedBatch.events.map((event) => event.id),
          ],
          relayUrls,
          since: sinceFromAgeHours(ageHours),
          deadlineMs: timeoutMs,
          signal,
        });
        return {
          events: mergeEvents(referencedBatch.events, replyTraversal.events),
          relayHintsByEventId: mergeRelayHints(
            referencedBatch.relayHintsByEventId,
            replyTraversal.relayHintsByEventId,
          ),
          queryCompletions: referencedBatch.queryCompletions,
          replyTraversalCompletion: replyTraversal.completion,
        };
      }

      const replyEvents: Event[] = [];
      const seenReplyIds = new Set<string>();
      const replyRelayHintsByEventId = new Map<string, string[]>();
      const replyQueryCompletions: QueryCompletion[] = [];
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
        replyQueryCompletions.push(...replyBatch.queryCompletions);
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
        queryCompletions: [
          ...referencedBatch.queryCompletions,
          ...replyQueryCompletions,
        ],
      };
    },
  );
}

async function fetchProfileMetadata(
  pubkeys: string[],
  timeoutMs: number,
  profileRelayUrls: readonly string[],
  signal?: AbortSignal,
): Promise<{
  profiles: Record<string, ProfileMetadata>;
  queryCompletions: QueryCompletion[];
}> {
  if (pubkeys.length === 0) {
    return { profiles: {}, queryCompletions: [] };
  }

  return withFiniteRelaySession(
    {
      relayUrls: profileRelayUrls,
      connectDeadlineMs: timeoutMs,
      signal,
    },
    async (session) => {
      const batch = await querySessionOnce(
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

      batch.events.forEach((event) => {
        const profile = parseProfileEvent(event);
        if (!profile) return;

        const existing = profiles[event.pubkey];
        if (existing && existing.createdAt >= event.created_at) return;

        profiles[event.pubkey] = {
          profile,
          createdAt: event.created_at,
        };
      });

      return {
        profiles: Object.fromEntries(
          Object.entries(profiles).map(([pubkey, entry]) => [
            pubkey,
            entry.profile,
          ]),
        ),
        queryCompletions: batch.queryCompletions,
      };
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
  const completeTraversal =
    options.completeTraversal ?? COMPLETE_WIRED_SNAPSHOT_TRAVERSAL_ENABLED;
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
    completeTraversal,
    {
      pow: powRelayUrls,
      replies: replyRelayUrls,
      snapshot: snapshotRelayUrls,
    },
    options.signal,
  );
  const feedReplyCompletion =
    feedBatch.replyTraversalCompletion ?? emptyReplyTraversalCompletion();
  const finitePhases: FeedSnapshotFinitePhaseCompletion[] = [
    ...feedBatch.finitePhases,
  ];
  const feedFiniteFailure = incompleteFinitePhase(finitePhases);
  if (completeTraversal && feedFiniteFailure) {
    const completion = {
      state: "incomplete",
      ...feedFiniteFailure,
      finitePhases,
      feedReplies: feedReplyCompletion,
    } satisfies FeedSnapshotTraversalCompletion;
    options.onTraversalComplete?.(completion);
    throw new IncompleteFeedSnapshotTraversalError(completion);
  }
  if (completeTraversal && feedReplyCompletion.state === "incomplete") {
    const completion = {
      state: "incomplete",
      phase: "feed-replies",
      reason: feedReplyCompletion.reason,
      finitePhases,
      feedReplies: feedReplyCompletion,
    } satisfies FeedSnapshotTraversalCompletion;
    options.onTraversalComplete?.(completion);
    throw new IncompleteFeedSnapshotTraversalError(completion);
  }
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
    completeTraversal,
    options.signal,
  );
  const referenceReplyCompletion =
    referencedBatch.replyTraversalCompletion ?? emptyReplyTraversalCompletion();
  finitePhases.push({
    phase: "references",
    queries: referencedBatch.queryCompletions,
  });
  const referenceFiniteFailure = incompleteFinitePhase(finitePhases);
  if (completeTraversal && referenceFiniteFailure) {
    const completion = {
      state: "incomplete",
      ...referenceFiniteFailure,
      finitePhases,
      feedReplies: feedReplyCompletion,
      referenceReplies: referenceReplyCompletion,
    } satisfies FeedSnapshotTraversalCompletion;
    options.onTraversalComplete?.(completion);
    throw new IncompleteFeedSnapshotTraversalError(completion);
  }
  if (completeTraversal && referenceReplyCompletion.state === "incomplete") {
    const completion = {
      state: "incomplete",
      phase: "reference-replies",
      reason: referenceReplyCompletion.reason,
      finitePhases,
      feedReplies: feedReplyCompletion,
      referenceReplies: referenceReplyCompletion,
    } satisfies FeedSnapshotTraversalCompletion;
    options.onTraversalComplete?.(completion);
    throw new IncompleteFeedSnapshotTraversalError(completion);
  }
  const events = mergeEvents(feedBatch.events, referencedBatch.events);
  const relayHintsByEventId = mergeRelayHints(
    feedBatch.relayHintsByEventId,
    referencedBatch.relayHintsByEventId,
  );
  const profileBatch = await fetchProfileMetadata(
    [...new Set([
      ...pubkeysFromProcessedEvents(processedEvents),
      ...pubkeysFromEvents(referencedBatch.events),
    ])],
    timeoutMs,
    profileRelayUrls,
    options.signal,
  );
  finitePhases.push({
    phase: "profiles",
    queries: profileBatch.queryCompletions,
  });
  const profileFiniteFailure = incompleteFinitePhase(finitePhases);
  if (completeTraversal && profileFiniteFailure) {
    const completion = {
      state: "incomplete",
      ...profileFiniteFailure,
      finitePhases,
      feedReplies: feedReplyCompletion,
      referenceReplies: referenceReplyCompletion,
    } satisfies FeedSnapshotTraversalCompletion;
    options.onTraversalComplete?.(completion);
    throw new IncompleteFeedSnapshotTraversalError(completion);
  }

  const snapshot: FeedBootstrapSnapshot = {
    fetchedAt: Date.now(),
    processedEvents: serializeProcessedEvents(processedEvents),
    eventsById: eventsById(events),
    relayHintsByEventId: serializeRelayHints(relayHintsByEventId),
    profiles: profileBatch.profiles,
    scoring: {
      ageHours,
      minPow: filterDifficulty,
      replyDepth: REPLY_FETCH_DEPTH,
      sort: "totalWork",
    },
  };
  if (completeTraversal) {
    options.onTraversalComplete?.({
      state: "complete",
      finitePhases,
      feedReplies: feedReplyCompletion,
      referenceReplies: referenceReplyCompletion,
    });
  }
  return snapshot;
}
