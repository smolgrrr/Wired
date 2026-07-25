import { useCallback, useEffect, useMemo, useState } from "react";
import { ensureRelaysConnected } from "../nostr/client";
import {
  subNote,
  type ThreadTraversalCompletion,
} from "../nostr/subscriptions";
import { useFilteredNoteSubscription } from "../shared/hooks/useFilteredNoteSubscription";
import { uniqueRelays } from "@lib/threadRefs";
import { THREAD_RELAYS } from "../config";

const NO_RELAY_HINTS: readonly string[] = [];

export function threadRelayUrls(relayHints: readonly string[] = []) {
  return uniqueRelays([...THREAD_RELAYS, ...relayHints]);
}

export function useThreadEvents(hexID: string, relayHints?: readonly string[]) {
  const requestedRelayHints = relayHints ?? NO_RELAY_HINTS;
  const relayUrls = useMemo(
    () => threadRelayUrls(requestedRelayHints),
    [requestedRelayHints],
  );
  const relayDependency = relayUrls.join(",");
  const [traversalCompletion, setTraversalCompletion] =
    useState<ThreadTraversalCompletion | null>(null);
  useEffect(() => {
    setTraversalCompletion(null);
  }, [hexID, relayDependency]);
  const subscribe = useCallback(
    async (onEvent: Parameters<typeof subNote>[1]) => {
      await ensureRelaysConnected(relayUrls);
      return subNote(hexID, onEvent, relayUrls, {
        onTraversalComplete: setTraversalCompletion,
      });
    },
    [hexID, relayUrls],
  );

  const noteEvents = useFilteredNoteSubscription(
    subscribe,
    [hexID, relayDependency],
    true,
    { initialize: false },
  );

  return { noteEvents, traversalCompletion };
}
