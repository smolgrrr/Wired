import { useCallback, useEffect, useMemo, useState } from "react";
import type { Event } from "nostr-tools";
import { subGlobalFeed, subRepliesForRootIds } from "../nostr/subscriptions";
import { processFeedEvents } from "../nostr/processEvents";
import type { RelayHintsByEventId } from "../nostr/types";
import { useSettings } from "../app/settings";
import { POW_RELAYS, THREAD_RELAYS } from "../config";
import {
  useFilteredNoteSubscriptionWithRelays,
} from "../shared/hooks/useFilteredNoteSubscription";
import { useModerationManifest } from "../shared/hooks/useModerationManifest";
import { seedProfiles } from "../shared/hooks/useProfiles";
import { filterModeratedEvents } from "../shared/lib/moderation";
import {
  canUseFeedBootstrap,
  eventsFromProcessed,
  fetchFeedBootstrapSnapshot,
  relayHintsFromProcessed,
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

export function useFeed({ mode = "default" }: { mode?: FeedMode } = {}) {
  const { settings } = useSettings();
  const moderationManifest = useModerationManifest();
  const isRawMode = mode === "raw";
  const rawFilterDifficulty = isRawMode ? settings.filterDifficulty : undefined;
  const bootstrapEligible = !isRawMode && canUseFeedBootstrap(settings);
  const [bootstrapEvents, setBootstrapEvents] = useState<Event[]>([]);
  const [bootstrapRootIds, setBootstrapRootIds] = useState<string[]>([]);
  const [bootstrapRelayHintsByEventId, setBootstrapRelayHintsByEventId] =
    useState<RelayHintsByEventId>(() => new Map());

  useEffect(() => {
    if (!bootstrapEligible) {
      setBootstrapEvents([]);
      setBootstrapRootIds([]);
      setBootstrapRelayHintsByEventId(new Map());
      return;
    }

    let cancelled = false;

    void fetchFeedBootstrapSnapshot()
      .then((snapshot) => {
        if (cancelled) return;
        if (!snapshot) {
          setBootstrapEvents([]);
          setBootstrapRootIds([]);
          setBootstrapRelayHintsByEventId(new Map());
          return;
        }
        setBootstrapEvents(eventsFromProcessed(snapshot.processedEvents));
        setBootstrapRelayHintsByEventId(
          relayHintsFromProcessed(snapshot.processedEvents),
        );
        setBootstrapRootIds(
          snapshot.processedEvents.map((event) => event.postEvent.id),
        );
        seedProfiles(snapshot.profiles);
      })
      .catch(() => {
        // Fall back to live relay subscription only.
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
          rootFilterDifficulty: rawFilterDifficulty,
          replyDepth: FEED_REPLY_DEPTH,
        },
      ),
    [rawFilterDifficulty, settings.ageHours],
  );

  const {
    noteEvents: liveEvents,
    relayHintsByEventId: liveRelayHintsByEventId,
  } = useFilteredNoteSubscriptionWithRelays(subscribe, [
    mode,
    settings.ageHours,
    rawFilterDifficulty,
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
  const processedEvents = useMemo(
    () =>
      processFeedEvents(
        visibleNoteEvents,
        settings.filterDifficulty,
        relayHintsByEventId,
      ),
    [visibleNoteEvents, settings.filterDifficulty, relayHintsByEventId],
  );

  return { processedEvents, noteEvents: visibleNoteEvents };
}
