import type { Event } from "nostr-tools";
import { isRootNote } from "../shared/lib/noteEvents.js";
import { verifyPow } from "../shared/pow/core.js";

const EVENT_ID_PATTERN = /^[0-9a-f]{64}$/i;
const ROOT_RESOLUTION_DEPTH = 4;

export type FeedRootRef = {
  id: string;
  relays: string[];
};

export type FeedCandidateDecision = {
  accepted: boolean;
  rootId: string | null;
  rootRef: FeedRootRef | null;
  replyRootId: string | null;
};

export function isEventId(value: string | undefined): value is string {
  return Boolean(value && EVENT_ID_PATTERN.test(value));
}

function normalizeRelayUrl(relay: string): string {
  return relay.trim().replace(/\/+$/, "");
}

export function uniqueRelayUrls(relays: readonly string[]): string[] {
  return [
    ...new Set(
      relays
        .map(normalizeRelayUrl)
        .filter((relay) => relay.startsWith("ws://") || relay.startsWith("wss://")),
    ),
  ];
}

function eventId(id: string): string {
  return id.toLowerCase();
}

function rootRefFromTag(tag: string[]): FeedRootRef | null {
  if (tag[0] !== "e" || !isEventId(tag[1])) return null;

  return {
    id: eventId(tag[1]),
    relays: tag[2] ? uniqueRelayUrls([tag[2]]) : [],
  };
}

export function mergeFeedRootRefs(refs: readonly FeedRootRef[]): FeedRootRef[] {
  const byId = new Map<string, string[]>();

  refs.forEach((ref) => {
    byId.set(ref.id, uniqueRelayUrls([...(byId.get(ref.id) ?? []), ...ref.relays]));
  });

  return [...byId.entries()].map(([id, relays]) => ({ id, relays }));
}

export function buildFeedEventMap(events: readonly Event[]): Map<string, Event> {
  const eventsById = new Map<string, Event>();

  events.forEach((event) => {
    eventsById.set(eventId(event.id), event);
  });

  return eventsById;
}

export function isFeedThreadRootEvent(event: Event): boolean {
  return event.kind === 1 && isRootNote(event);
}

export function isFeedPostEvent(event: Event): boolean {
  return isFeedThreadRootEvent(event) || event.kind === 1068;
}

function taggedRootRef(event: Event): FeedRootRef | null {
  const rootMarkedRef = event.tags
    .filter((tag) => tag[3] === "root")
    .map(rootRefFromTag)
    .find((ref): ref is FeedRootRef => ref !== null);

  if (rootMarkedRef) return rootMarkedRef;

  return event.tags
    .map(rootRefFromTag)
    .find((ref): ref is FeedRootRef => ref !== null) ?? null;
}

export function feedActivityRootRef(
  event: Event,
  eventsById?: ReadonlyMap<string, Event>,
  maxDepth = ROOT_RESOLUTION_DEPTH,
): FeedRootRef | null {
  if (event.kind === 1068) {
    return { id: eventId(event.id), relays: [] };
  }

  if (event.kind !== 1) return null;

  if (isRootNote(event)) {
    return { id: eventId(event.id), relays: [] };
  }

  const firstRef = taggedRootRef(event);
  if (!firstRef) return null;
  if (!eventsById) return firstRef;

  const seen = new Set<string>([eventId(event.id)]);
  let currentRef = firstRef;

  for (let depth = 0; depth < maxDepth; depth += 1) {
    const linkedEvent = eventsById.get(currentRef.id);
    if (!linkedEvent || seen.has(eventId(linkedEvent.id))) {
      return currentRef;
    }

    if (isFeedPostEvent(linkedEvent)) {
      return {
        id: eventId(linkedEvent.id),
        relays: uniqueRelayUrls(currentRef.relays),
      };
    }

    const parentRef = taggedRootRef(linkedEvent);
    if (!parentRef) return currentRef;

    seen.add(eventId(linkedEvent.id));
    currentRef = {
      id: parentRef.id,
      relays: uniqueRelayUrls([...currentRef.relays, ...parentRef.relays]),
    };
  }

  return currentRef;
}

export function feedRootEventId(
  event: Event,
  eventsById?: ReadonlyMap<string, Event>,
): string | null {
  return feedActivityRootRef(event, eventsById)?.id ?? null;
}

export function feedReplyRootId(
  event: Event,
  eventsById?: ReadonlyMap<string, Event>,
): string | null {
  return feedRootEventId(event, eventsById);
}

export function feedActivityRootRefs(
  event: Event,
  eventsById?: ReadonlyMap<string, Event>,
): FeedRootRef[] {
  const ref = feedActivityRootRef(event, eventsById);
  return ref ? [ref] : [];
}

export function feedRootRefsFromActivity(
  events: readonly Event[],
  filterDifficulty = 0,
  eventsById: ReadonlyMap<string, Event> = buildFeedEventMap(events),
): FeedRootRef[] {
  const candidates = createFeedCandidateTracker(filterDifficulty);
  const refs: FeedRootRef[] = [];

  events.forEach((event) => {
    const decision = candidates.check(event, eventsById);
    if (decision.rootRef) refs.push(decision.rootRef);
  });

  return mergeFeedRootRefs(refs);
}

export function isQualifyingFeedActivity(
  event: Event,
  filterDifficulty = 0,
): boolean {
  return event.kind === 1 && verifyPow(event) >= filterDifficulty;
}

export function createFeedCandidateTracker(filterDifficulty = 0) {
  return {
    check(
      event: Event,
      eventsById?: ReadonlyMap<string, Event>,
    ): FeedCandidateDecision {
      if (event.kind !== 1 && event.kind !== 1068) {
        return { accepted: false, rootId: null, rootRef: null, replyRootId: null };
      }

      const rootRef = feedActivityRootRef(event, eventsById);
      if (!rootRef) {
        return { accepted: false, rootId: null, rootRef: null, replyRootId: null };
      }

      if (verifyPow(event) < filterDifficulty) {
        return { accepted: false, rootId: null, rootRef: null, replyRootId: null };
      }

      return {
        accepted: true,
        rootId: rootRef.id,
        rootRef,
        replyRootId: rootRef.id,
      };
    },
  };
}
