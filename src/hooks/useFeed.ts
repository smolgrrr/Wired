import { useCallback, useMemo } from "react";
import { subGlobalFeed } from "../nostr/subscriptions";
import { processFeedEvents } from "../nostr/processEvents";
import { useSettings } from "../app/settings";
import { useNostrSubscription } from "../shared/hooks/useNostrSubscription";
import { filterNoteEvents } from "../shared/utils/noteEvents";

export function useFeed() {
  const { settings } = useSettings();

  const subscribe = useCallback(
    (onEvent: Parameters<typeof subGlobalFeed>[0]) =>
      subGlobalFeed(onEvent, settings.ageHours),
    [settings.ageHours],
  );

  const rawEvents = useNostrSubscription(subscribe, [settings.ageHours]);
  const noteEvents = useMemo(() => filterNoteEvents(rawEvents), [rawEvents]);
  const processedEvents = useMemo(
    () => processFeedEvents(noteEvents, settings.filterDifficulty),
    [noteEvents, settings.filterDifficulty],
  );

  return { processedEvents, noteEvents };
}