import { useCallback, useMemo } from "react";
import { subNotifications } from "../nostr/subscriptions";
import { useStoredKeys } from "../shared/hooks/useStoredKeys";
import { useNostrSubscription } from "../shared/hooks/useNostrSubscription";
import { filterNoteEvents } from "../shared/utils/noteEvents";

export function useNotificationEvents() {
  const { pubkeys } = useStoredKeys();
  const pubkeyKey = pubkeys.join(",");

  const subscribe = useCallback(
    (onEvent: Parameters<typeof subNotifications>[1]) =>
      subNotifications(pubkeys, onEvent),
    [pubkeys],
  );

  const rawEvents = useNostrSubscription(subscribe, [pubkeyKey]);
  const noteEvents = useMemo(() => filterNoteEvents(rawEvents), [rawEvents]);

  return { noteEvents, pubkeys };
}