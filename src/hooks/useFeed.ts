import { useCallback, useEffect, useMemo, useState } from "react";
import type { Event } from "nostr-tools";
import { subGlobalFeed } from "../nostr/subscriptions";
import { processFeedEvents } from "../nostr/processEvents";
import { useSettings } from "../app/settings";
import { useFilteredNoteSubscription } from "../shared/hooks/useFilteredNoteSubscription";
import { seedProfiles } from "../shared/hooks/useProfiles";
import {
  canUseFeedBootstrap,
  eventsFromProcessed,
  type FeedBootstrapResponse,
} from "../shared/lib/feedBootstrapClient";

function mergeNoteEvents(bootstrapEvents: Event[], liveEvents: Event[]): Event[] {
  const merged = new Map<string, Event>();
  bootstrapEvents.forEach((event) => merged.set(event.id, event));
  liveEvents.forEach((event) => merged.set(event.id, event));
  return [...merged.values()];
}

export function useFeed() {
  const { settings } = useSettings();
  const bootstrapEligible = canUseFeedBootstrap(settings);
  const [bootstrapEvents, setBootstrapEvents] = useState<Event[]>([]);

  useEffect(() => {
    if (!bootstrapEligible) {
      setBootstrapEvents([]);
      return;
    }

    let cancelled = false;

    void fetch("/api/feed/bootstrap")
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json() as Promise<FeedBootstrapResponse>;
      })
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
      subGlobalFeed(onEvent, settings.ageHours),
    [settings.ageHours],
  );

  const liveEvents = useFilteredNoteSubscription(subscribe, [settings.ageHours]);
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