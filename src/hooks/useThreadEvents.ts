import { useCallback, useMemo } from "react";
import { ensureRelaysConnected } from "../nostr/client";
import { subNote } from "../nostr/subscriptions";
import { useFilteredNoteSubscription } from "../shared/hooks/useFilteredNoteSubscription";
import { uniqueRelays } from "@lib/threadRefs";

export function useThreadEvents(hexID: string, relayHints: readonly string[] = []) {
  const relayUrls = useMemo(() => uniqueRelays(relayHints), [relayHints]);
  const relayDependency = relayUrls.join(",");
  const subscribe = useCallback(
    async (onEvent: Parameters<typeof subNote>[1]) => {
      await ensureRelaysConnected(relayUrls);
      return subNote(hexID, onEvent, relayUrls);
    },
    [hexID, relayUrls],
  );

  const noteEvents = useFilteredNoteSubscription(subscribe, [hexID, relayDependency]);

  return { noteEvents };
}
