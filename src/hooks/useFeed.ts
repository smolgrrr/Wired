import { useCallback, useMemo } from "react";
import { subGlobalFeed } from "../nostr/subscriptions";
import { processFeedEvents } from "../nostr/processEvents";
import { useSettings } from "../app/settings";
import { useFilteredNoteSubscription } from "../shared/hooks/useFilteredNoteSubscription";

export function useFeed() {
  const { settings } = useSettings();

  const subscribe = useCallback(
    (onEvent: Parameters<typeof subGlobalFeed>[0]) =>
      subGlobalFeed(onEvent, settings.ageHours),
    [settings.ageHours],
  );

  const noteEvents = useFilteredNoteSubscription(subscribe, [settings.ageHours]);
  const processedEvents = useMemo(
    () => processFeedEvents(noteEvents, settings.filterDifficulty),
    [noteEvents, settings.filterDifficulty],
  );

  return { processedEvents, noteEvents };
}