import type { Event } from "nostr-tools";
import { DYNAMIC_FEED_ROOT_HINTS_ENABLED, POW_RELAYS } from "../../config";
import {
  getRegistry,
  prepareRelayConnections,
  startFiniteQuery,
} from "../client";
import {
  DEFAULT_BROWSER_QUERY_DEADLINE_MS,
  type QueryCompletion,
} from "../browser-relay-access";
import type { SubCallback, SubHandle } from "../types";
import {
  ROOT_RESOLUTION_DEPTH,
  feedRootRefsFromQualifyingActivity,
  mergeFeedRootRefs,
  planFeedRootResolution,
  resolveFeedRootRef,
  uniqueRelayUrls,
  type FeedRootRef,
} from "../feed-candidates";
import { createSubHandleOwner, finiteQuerySubHandle } from "./utils";
import {
  buildReplyFilter,
  clampReplyDepth,
  limitReplyParentIds,
  sinceFromAgeHours,
} from "./query-limits";

export const FEED_REPLY_PARENT_CHUNK_SIZE = 20;
export const FEED_ROOT_FETCH_CHUNK_SIZE = 20;

type GlobalFeedOptions = {
  rootRelayUrls?: readonly string[];
  replyRelayUrls?: readonly string[];
  rootFilterDifficulty?: number;
  replyDepth?: number;
  onInitialEose?: () => void;
  dynamicRootHints?: boolean;
};

function uniqueRelays(relays: readonly string[]): string[] {
  return uniqueRelayUrls(relays);
}

type HintQueryPlan = {
  ids: string[];
  relayUrl: string;
};

function hintQueryPlans(
  roots: readonly FeedRootRef[],
  configuredRelayUrls: readonly string[],
): HintQueryPlan[] {
  const configured = new Set(configuredRelayUrls);
  const idsByRelay = new Map<string, Set<string>>();

  roots.forEach((ref) => {
    uniqueRelays(ref.relays)
      .filter((relayUrl) => !configured.has(relayUrl))
      .forEach((relayUrl) => {
        const ids = idsByRelay.get(relayUrl) ?? new Set<string>();
        ids.add(ref.id.toLowerCase());
        idsByRelay.set(relayUrl, ids);
      });
  });

  return [...idsByRelay.entries()].map(([relayUrl, ids]) => ({
    ids: [...ids],
    relayUrl,
  }));
}

function rootRelayPlan(
  roots: Iterable<FeedRootRef>,
  fallbackRelays: readonly string[] | undefined,
): {
  configuredRelayUrls: readonly string[];
  hintPlans: HintQueryPlan[];
} {
  const rootRefs = [...roots];
  const configuredRelayUrls = uniqueRelays(fallbackRelays ?? POW_RELAYS);
  return {
    configuredRelayUrls,
    hintPlans: hintQueryPlans(rootRefs, configuredRelayUrls),
  };
}

function chunkItems<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

class FeedReplyTraversal {
  private readonly owner = createSubHandleOwner("feed-replies");

  constructor(
    private readonly onEvent: SubCallback,
    private readonly relayUrls: readonly string[] | undefined,
    private readonly depth: number,
    private readonly since: number,
  ) {}

  get handle(): SubHandle {
    return this.owner.handle();
  }

  start(parentIds: string[]) {
    this.subscribeParents(parentIds, this.depth);
  }

  private subscribeParents(parentIds: string[], depth: number) {
    if (parentIds.length === 0 || depth <= 0) return;

    const chunks = chunkItems(
      limitReplyParentIds(parentIds),
      FEED_REPLY_PARENT_CHUNK_SIZE,
    );
    const childReplyIds = new Set<string>();
    this.subscribeParentChunk(chunks, 0, childReplyIds, depth);
  }

  private subscribeParentChunk(
    parentChunks: string[][],
    index: number,
    childReplyIds: Set<string>,
    depth: number,
  ) {
    const parentIds = parentChunks[index];
    if (!parentIds) {
      this.subscribeParents(Array.from(childReplyIds), depth - 1);
      return;
    }

    const filter = buildReplyFilter(parentIds, this.since);
    if (!filter) {
      this.subscribeParentChunk(parentChunks, index + 1, childReplyIds, depth);
      return;
    }

    this.owner.add(getRegistry().subscribe([
      {
        filter,
        relayUrls: this.relayUrls ? [...this.relayUrls] : undefined,
        cb: (evt, relay) => {
          childReplyIds.add(evt.id);
          this.onEvent(evt, relay);
        },
        closeOnEose: true,
        onEose: () => {
          this.subscribeParentChunk(
            parentChunks,
            index + 1,
            childReplyIds,
            depth,
          );
        },
      },
    ]));
  }
}

class FeedRootFetch {
  private closed = false;
  private readonly owner = createSubHandleOwner(
    "feed-roots",
    () => { this.closed = true; },
  );
  private readonly requestedIds = new Set<string>();

  constructor(
    private readonly onEvent: SubCallback,
    private readonly fallbackRelayUrls: readonly string[] | undefined,
    private readonly eventsById: Map<string, Event>,
    private readonly onRootEvents: (events: Event[]) => void,
    private readonly dynamicRootHints: boolean,
  ) {}

  get handle(): SubHandle {
    return this.owner.handle();
  }

  start(rootRefs: FeedRootRef[], depth = ROOT_RESOLUTION_DEPTH) {
    if (rootRefs.length === 0) return;

    const { rootEvents, refsToFetch } = planFeedRootResolution(
      rootRefs,
      this.eventsById,
      this.requestedIds,
    );

    if (rootEvents.length > 0) {
      this.onRootEvents(rootEvents);
    }

    if (depth <= 0) return;

    refsToFetch.forEach((ref) => this.requestedIds.add(ref.id));

    const chunks = chunkItems(
      mergeFeedRootRefs(refsToFetch),
      FEED_ROOT_FETCH_CHUNK_SIZE,
    );
    this.subscribeRootChunks(chunks, new Map(), depth);
  }

  private subscribeRootChunks(
    rootChunks: FeedRootRef[][],
    nextRefs: Map<string, FeedRootRef>,
    depth: number,
  ) {
    const addNextRef = (ref: FeedRootRef) => {
      const [merged] = mergeFeedRootRefs([
        ...(nextRefs.get(ref.id) ? [nextRefs.get(ref.id)!] : []),
        ref,
      ]);
      nextRefs.set(ref.id, merged);
    };

    const recordRootEvent = (evt: Event, relay: string) => {
      this.eventsById.set(evt.id.toLowerCase(), evt);
      this.onEvent(evt, relay);

      const nextRef = resolveFeedRootRef(evt, this.eventsById);
      if (nextRef?.id === evt.id.toLowerCase()) {
        this.onRootEvents([evt]);
        return;
      }

      if (nextRef) addNextRef(nextRef);
    };
    const onExpectedRootEvent = (expectedIds: readonly string[]) => {
      const expected = new Set(expectedIds.map((id) => id.toLowerCase()));
      return (evt: Event, relay: string) => {
        if (!expected.has(evt.id.toLowerCase())) return;
        recordRootEvent(evt, relay);
      };
    };
    const relayPlan = rootRelayPlan(
      rootChunks.flat(),
      this.fallbackRelayUrls,
    );
    const hintPreparations = new Map<
      string,
      ReturnType<typeof prepareRelayConnections>
    >();
    const hintQueues = new Map<string, Promise<void>>();
    let configuredComplete = false;
    let pendingHintChunks = this.dynamicRootHints ? rootChunks.length : 0;
    let batchComplete = false;

    const maybeFinishBatch = () => {
      if (
        this.closed ||
        batchComplete ||
        !configuredComplete ||
        pendingHintChunks > 0
      ) return;
      batchComplete = true;
      this.start([...nextRefs.values()], depth - 1);
    };
    const completeHintChunk = () => {
      if (this.closed) return;
      pendingHintChunks -= 1;
      maybeFinishBatch();
    };
    const startExactRootQuery = (
      ids: string[],
      configuredRelayUrls: readonly string[],
      hintedRelayUrls: readonly string[],
      handleId: string,
      onComplete: (completion: QueryCompletion) => void,
    ) => {
      const query = startFiniteQuery({
        workflowOwner: "wired.browser.feed",
        filters: [{
          ids,
          kinds: [1],
          limit: ids.length,
        }],
        coverage: { configuredRelayUrls, hintedRelayUrls },
        completionDeadlineMs: DEFAULT_BROWSER_QUERY_DEADLINE_MS,
        onEvent: onExpectedRootEvent(ids),
        onComplete,
      });
      this.owner.add(finiteQuerySubHandle(handleId, query));
    };
    const startHintChunk = (chunk: FeedRootRef[], index: number) => {
      if (this.closed) return;
      const missingRefs = chunk.filter((ref) =>
        !this.eventsById.has(ref.id.toLowerCase())
      );
      const hintPlans = hintQueryPlans(
        missingRefs,
        relayPlan.configuredRelayUrls,
      );
      if (hintPlans.length === 0) {
        completeHintChunk();
        return;
      }

      let pendingPlans = hintPlans.length;
      const completePlan = () => {
        if (this.closed) return;
        pendingPlans -= 1;
        if (pendingPlans === 0) completeHintChunk();
      };
      hintPlans.forEach((hintPlan) => {
        const prior = hintQueues.get(hintPlan.relayUrl) ??
          hintPreparations.get(hintPlan.relayUrl)?.done ??
          Promise.resolve();
        const queued = prior.catch(() => {}).then(() =>
          new Promise<void>((resolve) => {
            if (this.closed) {
              resolve();
              return;
            }
            const stillMissingIds = hintPlan.ids.filter((id) =>
              !this.eventsById.has(id.toLowerCase())
            );
            if (stillMissingIds.length === 0) {
              resolve();
              return;
            }
            startExactRootQuery(
              stillMissingIds,
              [hintPlan.relayUrl],
              [],
              `feed-root-hint-chunk:${index}:${hintPlan.relayUrl}`,
              () => resolve(),
            );
          })
        );
        hintQueues.set(hintPlan.relayUrl, queued);
        void queued.then(completePlan);
      });
    };
    const startConfiguredChunk = (index: number) => {
      if (this.closed) return;
      const chunk = rootChunks[index];
      if (!chunk) {
        configuredComplete = true;
        maybeFinishBatch();
        return;
      }
      const ids = chunk.map((ref) => ref.id);
      const chunkHints = hintQueryPlans(
        chunk,
        relayPlan.configuredRelayUrls,
      ).map((plan) => plan.relayUrl);
      startExactRootQuery(
        ids,
        relayPlan.configuredRelayUrls,
        this.dynamicRootHints ? [] : chunkHints,
        `feed-root-chunk:${index}`,
        (completion) => {
          if (completion.reason === "cancelled") return;
          queueMicrotask(() => {
            startConfiguredChunk(index + 1);
            if (this.dynamicRootHints) startHintChunk(chunk, index);
          });
        },
      );
    };

    startConfiguredChunk(0);
    if (this.dynamicRootHints) {
      relayPlan.hintPlans.forEach((hintPlan) => {
        const preparation = prepareRelayConnections(
          [hintPlan.relayUrl],
          "wired.browser.feed",
        );
        hintPreparations.set(hintPlan.relayUrl, preparation);
        this.owner.add({
          id: `feed-root-hint-connection:${hintPlan.relayUrl}`,
          close: preparation.close,
        });
      });
    }
  }
}

export const subRepliesForRootIds = (
  rootIds: string[],
  onEvent: SubCallback,
  options: {
    relayUrls?: readonly string[];
    depth?: number;
    since?: number;
  } = {},
): SubHandle => {
  const traversal = new FeedReplyTraversal(
    onEvent,
    options.relayUrls,
    clampReplyDepth(options.depth ?? 1),
    options.since ?? sinceFromAgeHours(24),
  );

  traversal.start(rootIds);
  return traversal.handle;
};

export const subGlobalFeed = (
  onEvent: SubCallback,
  ageHours: number,
  options: GlobalFeedOptions = {},
): SubHandle => {
  const owner = createSubHandleOwner("global-feed");
  const activityEvents: Event[] = [];
  const eventsById = new Map<string, Event>();
  const replyRootIds = new Set<string>();
  const now = Math.floor(Date.now() / 1000);
  const since = sinceFromAgeHours(ageHours, now);
  const replyDepth = clampReplyDepth(options.replyDepth ?? 1);
  const replies = new FeedReplyTraversal(
    onEvent,
    options.replyRelayUrls,
    replyDepth,
    since,
  );
  const startRepliesForRoots = (events: Event[]) => {
    const rootIds = events
      .map((event) => event.id.toLowerCase())
      .filter((rootId) => {
        if (replyRootIds.has(rootId)) return false;
        replyRootIds.add(rootId);
        return true;
      });

    replies.start(rootIds);
  };
  const rootFetch = new FeedRootFetch(
    onEvent,
    options.replyRelayUrls ?? options.rootRelayUrls ?? POW_RELAYS,
    eventsById,
    startRepliesForRoots,
    options.dynamicRootHints ?? DYNAMIC_FEED_ROOT_HINTS_ENABLED,
  );

  owner.add(replies.handle);
  owner.add(rootFetch.handle);

  const activityQuery = startFiniteQuery({
    workflowOwner: "wired.browser.feed",
    filters: [{
      kinds: [1],
      since,
      limit: 500,
    }],
    coverage: {
      configuredRelayUrls: options.rootRelayUrls ?? POW_RELAYS,
      hintedRelayUrls: [],
    },
    completionDeadlineMs: DEFAULT_BROWSER_QUERY_DEADLINE_MS,
    onEvent: (evt, relay) => {
      eventsById.set(evt.id.toLowerCase(), evt);
      activityEvents.push(evt);
      onEvent(evt, relay);
    },
    onComplete: (completion) => {
      if (completion.reason !== "cancelled") {
        options.onInitialEose?.();
        const rootRefs = feedRootRefsFromQualifyingActivity(
          activityEvents,
          options.rootFilterDifficulty ?? 0,
          eventsById,
        );
        activityEvents.length = 0;
        rootFetch.start(rootRefs);
      }
    },
  });
  owner.add(finiteQuerySubHandle("global-feed-activity", activityQuery));

  return owner.handle();
};
