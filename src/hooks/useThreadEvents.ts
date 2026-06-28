import { useCallback } from "react";
import { subNote } from "../nostr/subscriptions";
import { useFilteredNoteSubscription } from "../shared/hooks/useFilteredNoteSubscription";

export function useThreadEvents(hexID: string) {
  const subscribe = useCallback(
    (onEvent: Parameters<typeof subNote>[1]) => subNote(hexID, onEvent),
    [hexID],
  );

  const noteEvents = useFilteredNoteSubscription(subscribe, [hexID]);

  return { noteEvents };
}
