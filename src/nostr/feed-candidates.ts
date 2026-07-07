import type { Event } from "nostr-tools";
import { isRootNote } from "../shared/lib/noteEvents.js";
import { verifyPow } from "../shared/pow/core.js";

const EVENT_ID_PATTERN = /^[0-9a-f]{64}$/i;

export const ROOT_RESOLUTION_DEPTH = 4;
export const ROOT_QUERY_LIMIT = 500;

export type FeedRootRef = {
  id: string;
  relays: string[];
};

export type FeedRootResolutionPlan = {
  rootEvents: Event[];
  refsToFetch: FeedRootRef[];
};

export function isEventId(value: string | undefined): value is string {
  return Boolean(value && EVENT_ID_PATTERN.test(value));
}

function eventId(id: string): string {
  return id.toLowerCase();
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

export function mergeFeedRootRefs(refs: readonly FeedRootRef[]): FeedRootRef[] {
  const byId = new Map<string, string[]>();

  refs.forEach((ref) => {
    byId.set(eventId(ref.id), uniqueRelayUrls([
      ...(byId.get(eventId(ref.id)) ?? []),
      ...ref.relays,
    ]));
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

function rootRefFromTag(tag: string[]): FeedRootRef | null {
  if (tag[0] !== "e" || !isEventId(tag[1])) return null;

  return {
    id: eventId(tag[1]),
    relays: tag[2] ? uniqueRelayUrls([tag[2]]) : [],
  };
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

export function isFeedThreadRootEvent(event: Event): boolean {
  return event.kind === 1 && isRootNote(event);
}

export function isFeedPostEvent(event: Event): boolean {
  return isFeedThreadRootEvent(event);
}

export function resolveFeedRootRef(
  event: Event,
  eventsById?: ReadonlyMap<string, Event>,
  maxDepth = ROOT_RESOLUTION_DEPTH,
): FeedRootRef | null {
  if (event.kind !== 1) return null;

  if (isFeedThreadRootEvent(event)) {
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

    if (isFeedThreadRootEvent(linkedEvent)) {
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

export function feedRootRefsFromQualifyingActivity(
  events: readonly Event[],
  filterDifficulty = 0,
  eventsById: ReadonlyMap<string, Event> = buildFeedEventMap(events),
): FeedRootRef[] {
  const refs: FeedRootRef[] = [];

  events.forEach((event) => {
    if (event.kind !== 1 || verifyPow(event) < filterDifficulty) return;

    const ref = resolveFeedRootRef(event, eventsById);
    if (ref) refs.push(ref);
  });

  return mergeFeedRootRefs(refs);
}

export function planFeedRootResolution(
  rootRefs: readonly FeedRootRef[],
  eventsById: ReadonlyMap<string, Event>,
  requestedIds: ReadonlySet<string>,
  limit = ROOT_QUERY_LIMIT,
): FeedRootResolutionPlan {
  const rootEvents: Event[] = [];
  const refsToFetch: FeedRootRef[] = [];

  mergeFeedRootRefs(rootRefs).forEach((ref) => {
    const knownEvent = eventsById.get(ref.id);
    if (!knownEvent) {
      refsToFetch.push(ref);
      return;
    }

    if (isFeedThreadRootEvent(knownEvent)) {
      rootEvents.push(knownEvent);
      return;
    }

    const nextRef = resolveFeedRootRef(knownEvent, eventsById);
    if (nextRef && nextRef.id !== ref.id) {
      refsToFetch.push({
        id: nextRef.id,
        relays: uniqueRelayUrls([...ref.relays, ...nextRef.relays]),
      });
    }
  });

  return {
    rootEvents,
    refsToFetch: mergeFeedRootRefs(refsToFetch)
      .filter((ref) => !requestedIds.has(ref.id))
      .slice(0, limit),
  };
}
