import type { Event } from "nostr-tools";
import { getRegistry } from "../client";
import type { SubCallback, SubHandle } from "../types";
import {
  createFeedCandidateTracker,
  feedReplyRootId,
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

const trackRootNote = (notes: Set<string>, evt: Event) => {
  const replyRootId = feedReplyRootId(evt);
  if (replyRootId) {
    notes.add(replyRootId);
  }
};

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
  const notes = new Set<string>();
  const candidates = createFeedCandidateTracker(options.rootFilterDifficulty);
  const now = Math.floor(Date.now() / 1000);
  const since = sinceFromAgeHours(ageHours, now);
  const replyDepth = clampReplyDepth(options.replyDepth ?? 1);
  const replies = new FeedReplyTraversal(
    onEvent,
    options.replyRelayUrls,
    replyDepth,
    since,
  );

  owner.add(replies.handle);

  owner.add(
    registry.subscribe([
      {
        filter: {
          kinds: [1, 1068],
          since,
          limit: 500,
        },
        relayUrls: options.rootRelayUrls
          ? [...options.rootRelayUrls]
          : undefined,
        cb: (evt, relay) => {
          if (options.rootFilterDifficulty === undefined) {
            trackRootNote(notes, evt);
          } else {
            const decision = candidates.check(evt);
            if (decision.replyRootId) {
              notes.add(decision.replyRootId);
            }
          }
          onEvent(evt, relay);
        },
        closeOnEose: true,
        onEose: () => {
          if (notes.size === 0) return;

          const noteIds = Array.from(notes);
          notes.clear();
          replies.start(noteIds);
        },
      },
    ]),
  );

  return owner.handle();
};
