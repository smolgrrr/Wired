import { useCallback, useMemo } from "react";
import { subGlobalFeed } from "../nostr/subscriptions";
import { processFeedEvents } from "../nostr/processEvents";
import { useSettings } from "../app/settings";
import { useFilteredNoteSubscription } from "../shared/hooks/useFilteredNoteSubscription";

export function useFeed() {
  const { settings } = useSettings();

  const subscribe = useCallback(
    (onEvent: Parameters<typeof subGlobalFeed>[0]) =>
      subGlobalFeed(onEvent, settings.ageHours, settings.filterDifficulty),
    [settings.ageHours, settings.filterDifficulty],
  );

  const noteEvents = useFilteredNoteSubscription(subscribe, [
    settings.ageHours,
    settings.filterDifficulty,
  ]);
  const processedEvents = useMemo(
    () => processFeedEvents(noteEvents, settings.filterDifficulty),
    [noteEvents, settings.filterDifficulty],
  );

  return { processedEvents, noteEvents };
}