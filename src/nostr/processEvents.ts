import type { Event } from "nostr-tools";
import {
  buildFeedEventMap,
  feedRootRefsFromQualifyingActivity,
  isFeedPostEvent,
} from "./feed-candidates.js";
import {
  workScoreBreakdown,
  type WorkScoreOptions,
} from "./processing/pow-score.js";
import type { ProcessedEvent, RelayHintsByEventId } from "./types.js";

export type { ProcessedEvent } from "./types.js";

export function compareProcessedEventsByWork(
  a: ProcessedEvent,
  b: ProcessedEvent,
): number {
  return b.totalWork - a.totalWork || b.postEvent.created_at - a.postEvent.created_at;
}

function normalizeRelayUrl(relay: string): string {
  return relay.replace(/\/+$/, "");
}

function relayHintsForEvent(
  eventId: string,
  relayHintsByEventId?: RelayHintsByEventId,
): string[] | undefined {
  const relayHints = relayHintsByEventId?.get(eventId);
  if (!relayHints) return undefined;

  const normalized = [
    ...new Set(relayHints.map(normalizeRelayUrl).filter(Boolean)),
  ];

  return normalized.length > 0 ? normalized : undefined;
}

export function buildRepliesByParent(events: Event[]): Map<string, Event[]> {
  const repliesByParent = new Map<string, Event[]>();

  events.forEach((event) => {
    if (event.kind !== 1) return;
    event.tags.forEach((tag) => {
      if (tag[0] !== "e" || !tag[1]) return;
      const replies = repliesByParent.get(tag[1]) ?? [];
      replies.push(event);
      repliesByParent.set(tag[1], replies);
    });
  });

  return repliesByParent;
}

export function collectThreadReplies(
  rootId: string,
  repliesByParent: Map<string, Event[]>,
): Event[] {
  const replies: Event[] = [];
  const seen = new Set<string>();
  const pending = [...(repliesByParent.get(rootId) ?? [])];

  while (pending.length > 0) {
    const reply = pending.shift();
    if (!reply || seen.has(reply.id)) continue;

    seen.add(reply.id);
    replies.push(reply);
    pending.push(...(repliesByParent.get(reply.id) ?? []));
  }

  return replies;
}

export function scoreThreadPost(
  postEvent: Event,
  allEvents: Event[],
  options: WorkScoreOptions = {},
): ProcessedEvent {
  const repliesByParent = buildRepliesByParent(allEvents);
  const replies = collectThreadReplies(postEvent.id, repliesByParent);

  return {
    postEvent,
    replies,
    threadReplyCount: replies.length,
    ...workScoreBreakdown(postEvent, replies, options),
  };
}

export type ProcessFeedEventsOptions = {
  activityRootIds?: Iterable<string>;
};

export function toProcessedEvents(
  posts: Event[],
  replySource: Event[],
  relayHintsByEventId?: RelayHintsByEventId,
): ProcessedEvent[] {
  const repliesByParent = buildRepliesByParent(replySource);

  return posts
    .map((postEvent) => {
      const replies = repliesByParent.get(postEvent.id) ?? [];
      return {
        postEvent,
        replies,
        relayHints: relayHintsForEvent(postEvent.id, relayHintsByEventId),
        threadReplyCount: replies.length,
        ...workScoreBreakdown(postEvent, replies),
      };
    })
    .sort((a, b) => a.postEvent.created_at - b.postEvent.created_at);
}

export const processFeedEvents = (
  events: Event[],
  filterDifficulty = 0,
  relayHintsByEventId?: RelayHintsByEventId,
  options: ProcessFeedEventsOptions = {},
): ProcessedEvent[] => {
  const eventsById = buildFeedEventMap(events);
  const repliesByParent = buildRepliesByParent(events);
  const activityRootIds = new Set(
    [...(options.activityRootIds ?? [])].map((id) => id.toLowerCase()),
  );

  feedRootRefsFromQualifyingActivity(
    events,
    filterDifficulty,
    eventsById,
  ).forEach((ref) => {
    activityRootIds.add(ref.id);
  });

  const posts = [...activityRootIds]
    .map((id) => eventsById.get(id))
    .filter((event): event is Event => !!event && isFeedPostEvent(event));

  return posts
    .map((postEvent) => {
      const replies = collectThreadReplies(postEvent.id, repliesByParent);
      return {
        postEvent,
        replies,
        relayHints: relayHintsForEvent(postEvent.id, relayHintsByEventId),
        threadReplyCount: replies.length,
        ...workScoreBreakdown(postEvent, replies),
      };
    })
    .sort(compareProcessedEventsByWork);
};
