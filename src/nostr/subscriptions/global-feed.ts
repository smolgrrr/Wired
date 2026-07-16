import type { Event } from "nostr-tools";
import { POW_RELAYS } from "../../config";
import { getRegistry, startFiniteQuery } from "../client";
import { DEFAULT_BROWSER_QUERY_DEADLINE_MS } from "../browser-relay-access";
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
};

function uniqueRelays(relays: readonly string[]): string[] {
  return uniqueRelayUrls(relays);
}

function rootRelayCoverage(
  roots: Iterable<FeedRootRef>,
  fallbackRelays: readonly string[] | undefined,
): {
  configuredRelayUrls: readonly string[];
  hintedRelayUrls: readonly string[];
} {
  return {
    configuredRelayUrls: fallbackRelays ?? POW_RELAYS,
    hintedRelayUrls: uniqueRelays([...roots].flatMap((ref) => ref.relays)),
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
  private readonly owner = createSubHandleOwner("feed-roots");
  private readonly requestedIds = new Set<string>();

  constructor(
    private readonly onEvent: SubCallback,
    private readonly fallbackRelayUrls: readonly string[] | undefined,
    private readonly eventsById: Map<string, Event>,
    private readonly onRootEvents: (events: Event[]) => void,
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
    this.subscribeRootChunk(chunks, 0, new Map(), depth);
  }

  private subscribeRootChunk(
    rootChunks: FeedRootRef[][],
    index: number,
    nextRefs: Map<string, FeedRootRef>,
    depth: number,
  ) {
    const chunk = rootChunks[index];
    if (!chunk) {
      this.start([...nextRefs.values()], depth - 1);
      return;
    }

    const ids = chunk.map((ref) => ref.id);
    if (ids.length === 0) {
      this.subscribeRootChunk(rootChunks, index + 1, nextRefs, depth);
      return;
    }

    const addNextRef = (ref: FeedRootRef) => {
      const [merged] = mergeFeedRootRefs([
        ...(nextRefs.get(ref.id) ? [nextRefs.get(ref.id)!] : []),
        ref,
      ]);
      nextRefs.set(ref.id, merged);
    };

    const query = startFiniteQuery({
      workflowOwner: "wired.browser.feed",
      filters: [{
        ids,
        kinds: [1],
        limit: ids.length,
      }],
      coverage: rootRelayCoverage(chunk, this.fallbackRelayUrls),
      completionDeadlineMs: DEFAULT_BROWSER_QUERY_DEADLINE_MS,
      onEvent: (evt, relay) => {
        this.eventsById.set(evt.id.toLowerCase(), evt);
        this.onEvent(evt, relay);

        const nextRef = resolveFeedRootRef(evt, this.eventsById);
        if (nextRef?.id === evt.id.toLowerCase()) {
          this.onRootEvents([evt]);
          return;
        }

        if (nextRef) addNextRef(nextRef);
      },
      onComplete: (completion) => {
        if (completion.reason !== "cancelled") {
          this.subscribeRootChunk(rootChunks, index + 1, nextRefs, depth);
        }
      },
    });
    this.owner.add(finiteQuerySubHandle(`feed-root-chunk:${index}`, query));
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
