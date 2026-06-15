import { useCallback } from "react";
import { subNotifications } from "../nostr/subscriptions";
import { useStoredKeys } from "../shared/hooks/useStoredKeys";
import { useFilteredNoteSubscription } from "../shared/hooks/useFilteredNoteSubscription";

export function useNotificationEvents() {
  const { pubkeys } = useStoredKeys();
  const pubkeyKey = pubkeys.join(",");

  const subscribe = useCallback(
    (onEvent: Parameters<typeof subNotifications>[1]) =>
      subNotifications(pubkeys, onEvent),
    [pubkeys],
  );

  const noteEvents = useFilteredNoteSubscription(subscribe, [pubkeyKey]);

  return { noteEvents, pubkeys };
}