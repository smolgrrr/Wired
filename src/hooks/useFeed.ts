import { useCallback, useEffect, useMemo, useState } from "react";
import type { Event } from "nostr-tools";
import { subGlobalFeed, subRepliesForRootIds } from "../nostr/subscriptions";
import {
  compareProcessedEventsByWork,
  processFeedEvents,
  scoreThreadPost,
} from "../nostr/processEvents";
import type { ProcessedEvent, RelayHintsByEventId } from "../nostr/types";
import { useSettings } from "../app/settings";
import { POW_RELAYS, THREAD_RELAYS } from "../config";
import {
  useFilteredNoteSubscriptionWithRelays,
} from "../shared/hooks/useFilteredNoteSubscription";
import { useModerationManifest } from "../shared/hooks/useModerationManifest";
import { seedProfiles } from "../shared/hooks/useProfiles";
import {
  filterModeratedEvents,
  isEventModerated,
  type ModerationManifest,
} from "../shared/lib/moderation";
import {
  canUseFeedBootstrap,
  eventsFromSnapshot,
  loadFeedBootstrapSnapshot,
  processedEventsFromSnapshot,
  relayHintsFromSnapshot,
} from "../shared/lib/feedBootstrapClient";

const FEED_REPLY_DEPTH = 3;

type FeedMode = "default" | "raw";

function mergeNoteEvents(...eventGroups: Event[][]): Event[] {
  const merged = new Map<string, Event>();
  eventGroups.forEach((events) => {
    events.forEach((event) => merged.set(event.id, event));
  });
  return [...merged.values()];
}

function mergeRelayHints(
  ...hintGroups: RelayHintsByEventId[]
): RelayHintsByEventId {
  const merged = new Map<string, string[]>();

  hintGroups.forEach((relayHintsByEventId) => {
    relayHintsByEventId.forEach((relays, eventId) => {
      const existing = merged.get(eventId) ?? [];
      merged.set(eventId, [...new Set([...existing, ...relays])]);
    });
  });

  return merged;
}

function eventsFromProcessedFeedEvents(processedEvents: ProcessedEvent[]): Event[] {
  const events: Event[] = [];
  const seen = new Set<string>();

  processedEvents.forEach((processed) => {
    [processed.postEvent, ...processed.replies].forEach((event) => {
      if (seen.has(event.id)) return;
      seen.add(event.id);
      events.push(event);
    });
  });

  return events;
}

function isProcessedEventModerated(
  event: ProcessedEvent,
  moderationManifest: ModerationManifest,
): boolean {
  return (
    isEventModerated(event.postEvent, moderationManifest) ||
    event.replies.some((reply) => isEventModerated(reply, moderationManifest))
  );
}

function unionEvents(...eventGroups: Event[][]): Event[] {
  const merged = new Map<string, Event>();
  eventGroups.forEach((events) => {
    events.forEach((event) => merged.set(event.id, event));
  });
  return [...merged.values()];
}

function rescoreMergedProcessedEvent(
  existing: ProcessedEvent,
  incoming: ProcessedEvent,
  filterDifficulty: number,
): ProcessedEvent {
  const postEvent = existing.postEvent;
  const mergedEvents = unionEvents(
    [postEvent],
    existing.replies,
    incoming.replies,
  );

  return {
    ...scoreThreadPost(postEvent, mergedEvents, {
      minReplyDifficulty: filterDifficulty,
    }),
    relayHints: existing.relayHints ?? incoming.relayHints,
  };
}

export function mergeProcessedFeedEvents(
  bootstrapEvents: ProcessedEvent[],
  liveEvents: ProcessedEvent[],
  filterDifficulty = 0,
): ProcessedEvent[] {
  if (liveEvents.length === 0) return bootstrapEvents;

  const mergedByRootId = new Map<string, ProcessedEvent>();

  bootstrapEvents.forEach((event) => {
    mergedByRootId.set(event.postEvent.id, event);
  });

  liveEvents.forEach((event) => {
    const existing = mergedByRootId.get(event.postEvent.id);
    if (!existing) {
      mergedByRootId.set(event.postEvent.id, event);
      return;
    }

    mergedByRootId.set(
      event.postEvent.id,
      rescoreMergedProcessedEvent(existing, event, filterDifficulty),
    );
  });

  return [...mergedByRootId.values()].sort(compareProcessedEventsByWork);
}

export function useFeed({ mode = "default" }: { mode?: FeedMode } = {}) {
  const { settings } = useSettings();
  const moderationManifest = useModerationManifest();
  const isRawMode = mode === "raw";
  const bootstrapEligible = !isRawMode && canUseFeedBootstrap(settings);
  const [bootstrapProcessedEvents, setBootstrapProcessedEvents] = useState<ProcessedEvent[]>([]);
  const [bootstrapEvents, setBootstrapEvents] = useState<Event[]>([]);
  const [bootstrapRootIds, setBootstrapRootIds] = useState<string[]>([]);
  const [bootstrapRelayHintsByEventId, setBootstrapRelayHintsByEventId] =
    useState<RelayHintsByEventId>(() => new Map());

  useEffect(() => {
    if (!bootstrapEligible) {
      setBootstrapProcessedEvents([]);
      setBootstrapEvents([]);
      setBootstrapRootIds([]);
      setBootstrapRelayHintsByEventId(new Map());
      return;
    }

    let cancelled = false;

    void loadFeedBootstrapSnapshot()
      .then((snapshot) => {
        if (cancelled) return;
        if (!snapshot) {
          setBootstrapProcessedEvents([]);
          setBootstrapEvents([]);
          setBootstrapRootIds([]);
          setBootstrapRelayHintsByEventId(new Map());
          return;
        }
        const processedEvents = processedEventsFromSnapshot(snapshot);
        setBootstrapProcessedEvents(processedEvents);
        setBootstrapEvents(eventsFromSnapshot(snapshot));
        setBootstrapRelayHintsByEventId(
          relayHintsFromSnapshot(snapshot),
        );
        setBootstrapRootIds(
          processedEvents.map((event) => event.postEvent.id),
        );
        seedProfiles(snapshot.profiles);
      })
      .catch(() => {
        // Fall back to live relay subscription only.
        setBootstrapProcessedEvents([]);
        setBootstrapEvents([]);
        setBootstrapRootIds([]);
        setBootstrapRelayHintsByEventId(new Map());
      });

    return () => {
      cancelled = true;
    };
  }, [bootstrapEligible, settings.ageHours, settings.filterDifficulty]);

  const subscribe = useCallback(
    (onEvent: Parameters<typeof subGlobalFeed>[0]) =>
      subGlobalFeed(
        onEvent,
        settings.ageHours,
        {
          rootRelayUrls: POW_RELAYS,
          replyRelayUrls: THREAD_RELAYS,
          rootFilterDifficulty: settings.filterDifficulty,
          replyDepth: FEED_REPLY_DEPTH,
        },
      ),
    [settings.ageHours, settings.filterDifficulty],
  );

  const {
    noteEvents: liveEvents,
    relayHintsByEventId: liveRelayHintsByEventId,
  } = useFilteredNoteSubscriptionWithRelays(subscribe, [
    mode,
    settings.ageHours,
    settings.filterDifficulty,
  ]);

  const bootstrapRootKey = bootstrapRootIds.join(",");
  const subscribeBootstrapReplies = useCallback(
    (onEvent: Parameters<typeof subRepliesForRootIds>[1]) =>
      subRepliesForRootIds(bootstrapRootIds, onEvent, {
        relayUrls: THREAD_RELAYS,
        depth: FEED_REPLY_DEPTH,
      }),
    // Subscription factory is intentionally tied to the stable root key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bootstrapRootKey],
  );
  const {
    noteEvents: bootstrapReplyEvents,
    relayHintsByEventId: bootstrapReplyRelayHintsByEventId,
  } = useFilteredNoteSubscriptionWithRelays(
    subscribeBootstrapReplies,
    [bootstrapRootKey],
    !isRawMode && bootstrapRootIds.length > 0,
  );

  const noteEvents = useMemo(
    () => mergeNoteEvents(bootstrapEvents, liveEvents, bootstrapReplyEvents),
    [bootstrapEvents, liveEvents, bootstrapReplyEvents],
  );
  const relayHintsByEventId = useMemo(
    () =>
      mergeRelayHints(
        bootstrapRelayHintsByEventId,
        liveRelayHintsByEventId,
        bootstrapReplyRelayHintsByEventId,
      ),
    [
      bootstrapRelayHintsByEventId,
      liveRelayHintsByEventId,
      bootstrapReplyRelayHintsByEventId,
    ],
  );
  const visibleNoteEvents = useMemo(
    () => filterModeratedEvents(noteEvents, moderationManifest),
    [noteEvents, moderationManifest],
  );
  const visibleBootstrapProcessedEvents = useMemo(
    () =>
      moderationManifest.updatedAt === 0
        ? bootstrapProcessedEvents
        : bootstrapProcessedEvents.filter(
            (event) => !isProcessedEventModerated(event, moderationManifest),
          ),
    [bootstrapProcessedEvents, moderationManifest],
  );
  const liveProcessedEvents = useMemo(
    () => {
      const bootstrapFeedEvents = bootstrapEligible
        ? eventsFromProcessedFeedEvents(visibleBootstrapProcessedEvents)
        : [];
      const visibleLiveEvents = filterModeratedEvents(
        mergeNoteEvents(liveEvents, bootstrapReplyEvents),
        moderationManifest,
      );

      return processFeedEvents(
        mergeNoteEvents(bootstrapFeedEvents, visibleLiveEvents),
        settings.filterDifficulty,
        relayHintsByEventId,
      );
    },
    [
      bootstrapEligible,
      visibleBootstrapProcessedEvents,
      liveEvents,
      bootstrapReplyEvents,
      moderationManifest,
      settings.filterDifficulty,
      relayHintsByEventId,
    ],
  );
  const processedEvents = useMemo(
    () =>
      mergeProcessedFeedEvents(
        bootstrapEligible ? visibleBootstrapProcessedEvents : [],
        liveProcessedEvents,
        settings.filterDifficulty,
      ),
    [
      bootstrapEligible,
      visibleBootstrapProcessedEvents,
      liveProcessedEvents,
      settings.filterDifficulty,
    ],
  );

  return { processedEvents, noteEvents: visibleNoteEvents };
}
