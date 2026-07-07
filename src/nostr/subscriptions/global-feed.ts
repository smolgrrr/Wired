import type { Event } from "nostr-tools";
import { getRegistry } from "../client";
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
import { createSubHandleOwner } from "./utils";
import {
  buildReplyFilter,
  clampReplyDepth,
  sinceFromAgeHours,
} from "./query-limits";

type GlobalFeedOptions = {
  rootRelayUrls?: readonly string[];
  replyRelayUrls?: readonly string[];
  rootFilterDifficulty?: number;
  replyDepth?: number;
};

function uniqueRelays(relays: readonly string[]): string[] {
  return uniqueRelayUrls(relays);
}

function rootRelayUrls(
  roots: Iterable<FeedRootRef>,
  fallbackRelays: readonly string[] | undefined,
): string[] | undefined {
  const relays = uniqueRelays([
    ...(fallbackRelays ?? []),
    ...[...roots].flatMap((ref) => ref.relays),
  ]);

  return relays.length > 0 ? relays : undefined;
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

    const childReplyIds = new Set<string>();
    const filter = buildReplyFilter(parentIds, this.since);
    if (!filter) return;

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
          this.subscribeParents(Array.from(childReplyIds), depth - 1);
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

    {
      const chunk = mergeFeedRootRefs(refsToFetch);
      const ids = chunk.map((ref) => ref.id);
      if (ids.length > 0) {
        const nextRefs = new Map<string, FeedRootRef>();
        const addNextRef = (ref: FeedRootRef) => {
          const [merged] = mergeFeedRootRefs([
            ...(nextRefs.get(ref.id) ? [nextRefs.get(ref.id)!] : []),
            ref,
          ]);
          nextRefs.set(ref.id, merged);
        };

        this.owner.add(getRegistry().subscribe([
          {
            filter: {
              ids,
              kinds: [1],
              limit: ids.length,
            },
            relayUrls: rootRelayUrls(chunk, this.fallbackRelayUrls),
            cb: (evt, relay) => {
              this.eventsById.set(evt.id.toLowerCase(), evt);
              this.onEvent(evt, relay);

              const nextRef = resolveFeedRootRef(evt, this.eventsById);
              if (nextRef?.id === evt.id.toLowerCase()) {
                this.onRootEvents([evt]);
                return;
              }

              if (nextRef) addNextRef(nextRef);
            },
            closeOnEose: true,
            onEose: () => {
              this.start([...nextRefs.values()], depth - 1);
            },
          },
        ]));
      }
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
  const registry = getRegistry();
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
    options.replyRelayUrls ?? options.rootRelayUrls,
    eventsById,
    startRepliesForRoots,
  );

  owner.add(replies.handle);
  owner.add(rootFetch.handle);

  owner.add(
    registry.subscribe([
      {
        filter: {
          kinds: [1],
          since,
          limit: 500,
        },
        relayUrls: options.rootRelayUrls
          ? [...options.rootRelayUrls]
          : undefined,
        cb: (evt, relay) => {
          eventsById.set(evt.id.toLowerCase(), evt);
          activityEvents.push(evt);
          onEvent(evt, relay);
        },
        closeOnEose: true,
        onEose: () => {
          const rootRefs = feedRootRefsFromQualifyingActivity(
            activityEvents,
            options.rootFilterDifficulty ?? 0,
            eventsById,
          );
          activityEvents.length = 0;
          rootFetch.start(rootRefs);
        },
      },
    ]),
  );

  return owner.handle();
};
