import { useCallback, useEffect, useMemo, useState } from "react";
import type { Event } from "nostr-tools";
import { subGlobalFeed } from "../nostr/subscriptions";
import { processFeedEvents } from "../nostr/processEvents";
import { useSettings } from "../app/settings";
import { DEFAULT_RELAYS, QUOTE_FALLBACK_RELAYS } from "../config";
import { useFilteredNoteSubscription } from "../shared/hooks/useFilteredNoteSubscription";
import { seedProfiles } from "../shared/hooks/useProfiles";
import {
  canUseFeedBootstrap,
  eventsFromProcessed,
  fetchFeedBootstrapSnapshot,
} from "../shared/lib/feedBootstrapClient";

const RAW_REPLY_RELAYS = [
  ...new Set([...DEFAULT_RELAYS, ...QUOTE_FALLBACK_RELAYS]),
];
const RAW_REPLY_DEPTH = 3;

type FeedMode = "default" | "raw";

function mergeNoteEvents(bootstrapEvents: Event[], liveEvents: Event[]): Event[] {
  const merged = new Map<string, Event>();
  bootstrapEvents.forEach((event) => merged.set(event.id, event));
  liveEvents.forEach((event) => merged.set(event.id, event));
  return [...merged.values()];
}

export function useFeed({ mode = "default" }: { mode?: FeedMode } = {}) {
  const { settings } = useSettings();
  const isRawMode = mode === "raw";
  const rawFilterDifficulty = isRawMode ? settings.filterDifficulty : undefined;
  const bootstrapEligible = !isRawMode && canUseFeedBootstrap(settings);
  const [bootstrapEvents, setBootstrapEvents] = useState<Event[]>([]);

  useEffect(() => {
    if (!bootstrapEligible) {
      setBootstrapEvents([]);
      return;
    }

    let cancelled = false;

    void fetchFeedBootstrapSnapshot()
      .then((snapshot) => {
        if (cancelled || !snapshot) return;
        setBootstrapEvents(eventsFromProcessed(snapshot.processedEvents));
        seedProfiles(snapshot.profiles);
      })
      .catch(() => {
        // Fall back to live relay subscription only.
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
        isRawMode
          ? {
              rootRelayUrls: DEFAULT_RELAYS,
              replyRelayUrls: RAW_REPLY_RELAYS,
              rootFilterDifficulty: rawFilterDifficulty,
              replyDepth: RAW_REPLY_DEPTH,
            }
          : undefined,
      ),
    [isRawMode, rawFilterDifficulty, settings.ageHours],
  );

  const liveEvents = useFilteredNoteSubscription(subscribe, [
    mode,
    settings.ageHours,
    rawFilterDifficulty,
  ]);
  const noteEvents = useMemo(
    () => mergeNoteEvents(bootstrapEvents, liveEvents),
    [bootstrapEvents, liveEvents],
  );
  const processedEvents = useMemo(
    () => processFeedEvents(noteEvents, settings.filterDifficulty),
    [noteEvents, settings.filterDifficulty],
  );

  return { processedEvents, noteEvents };
}
