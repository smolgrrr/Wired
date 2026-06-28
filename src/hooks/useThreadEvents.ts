import { useCallback } from "react";
import { subNote } from "../nostr/subscriptions";
import { useFilteredNoteSubscription } from "../shared/hooks/useFilteredNoteSubscription";
import { useSettings } from "../app/settings";

export function useThreadEvents(hexID: string) {
  const { settings } = useSettings();
  const subscribe = useCallback(
    (onEvent: Parameters<typeof subNote>[1]) =>
      subNote(hexID, onEvent, settings.ageHours),
    [hexID, settings.ageHours],
  );

  const noteEvents = useFilteredNoteSubscription(subscribe, [
    hexID,
    settings.ageHours,
  ]);

  return { noteEvents };
}
