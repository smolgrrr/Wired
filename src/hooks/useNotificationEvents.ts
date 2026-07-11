import { useCallback, useEffect, useState } from "react";
import { subNotifications } from "../nostr/subscriptions";
import { useStoredKeys } from "../shared/hooks/useStoredKeys";
import { useFilteredNoteSubscription } from "../shared/hooks/useFilteredNoteSubscription";

export type NotificationSyncState = "idle" | "syncing" | "synced" | "degraded";

const DEGRADED_SYNC_TIMEOUT_MS = 8_000;

export function useNotificationEvents() {
  const { pubkeys } = useStoredKeys();
  const pubkeyKey = pubkeys.join(",");
  const hasLocalKeys = pubkeys.length > 0;
  const [syncState, setSyncState] = useState<NotificationSyncState>(
    hasLocalKeys ? "syncing" : "idle",
  );

  useEffect(() => {
    if (!hasLocalKeys) {
      setSyncState("idle");
      return;
    }

    setSyncState("syncing");
    const timeout = setTimeout(() => {
      setSyncState((current) => (current === "syncing" ? "degraded" : current));
    }, DEGRADED_SYNC_TIMEOUT_MS);

    return () => clearTimeout(timeout);
  }, [hasLocalKeys, pubkeyKey]);

  const subscribe = useCallback(
    (onEvent: Parameters<typeof subNotifications>[1]) =>
      subNotifications(pubkeys, onEvent, () => setSyncState("synced")),
    [pubkeys],
  );

  const noteEvents = useFilteredNoteSubscription(subscribe, [pubkeyKey], hasLocalKeys);

  return { noteEvents, pubkeys, syncState };
}
