import { useCallback, useMemo } from "react";
import { ensureRelaysConnected } from "../nostr/client";
import { subNote } from "../nostr/subscriptions";
import { useFilteredNoteSubscription } from "../shared/hooks/useFilteredNoteSubscription";
import { uniqueRelays } from "@lib/threadRefs";
import { THREAD_RELAYS } from "../config";

export function threadRelayUrls(relayHints: readonly string[] = []) {
  return uniqueRelays([...THREAD_RELAYS, ...relayHints]);
}

export function useThreadEvents(hexID: string, relayHints: readonly string[] = []) {
  const relayUrls = useMemo(() => threadRelayUrls(relayHints), [relayHints]);
  const relayDependency = relayUrls.join(",");
  const subscribe = useCallback(
    async (onEvent: Parameters<typeof subNote>[1]) => {
      await ensureRelaysConnected(relayUrls);
      return subNote(hexID, onEvent, relayUrls);
    },
    [hexID, relayUrls],
  );

  const noteEvents = useFilteredNoteSubscription(
    subscribe,
    [hexID, relayDependency],
    true,
    { initialize: false },
  );

  return { noteEvents };
}
