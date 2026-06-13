import { useCallback, useMemo } from "react";
import { subNote } from "../nostr/subscriptions";
import { useNostrSubscription } from "../shared/hooks/useNostrSubscription";
import { filterNoteEvents } from "../shared/utils/noteEvents";

export function useThreadEvents(hexID: string) {
  const subscribe = useCallback(
    (onEvent: Parameters<typeof subNote>[1]) => subNote(hexID, onEvent),
    [hexID],
  );

  const rawEvents = useNostrSubscription(subscribe, [hexID]);
  const noteEvents = useMemo(() => filterNoteEvents(rawEvents), [rawEvents]);

  return { noteEvents };
}