import { useMemo, type DependencyList } from "react";
import type { Event } from "nostr-tools";
import type { RelayHintsByEventId, SubCallback, SubHandle } from "../../nostr/types";
import { filterNoteEvents } from "@lib/noteEvents";
import {
  useNostrSubscription,
  useNostrSubscriptionWithRelays,
} from "./useNostrSubscription";

type FilteredNoteSubscriptionState = {
  noteEvents: Event[];
  relayHintsByEventId: RelayHintsByEventId;
};

export function useFilteredNoteSubscription(
  createSubscription: (onEvent: SubCallback) => SubHandle | Promise<SubHandle>,
  deps: DependencyList,
  enabled = true,
  options?: Parameters<typeof useNostrSubscription>[3],
): Event[] {
  const rawEvents = useNostrSubscription(createSubscription, deps, enabled, options);
  return useMemo(() => filterNoteEvents(rawEvents), [rawEvents]);
}

export function useFilteredNoteSubscriptionWithRelays(
  createSubscription: (onEvent: SubCallback) => SubHandle | Promise<SubHandle>,
  deps: DependencyList,
  enabled = true,
): FilteredNoteSubscriptionState {
  const { events, relayHintsByEventId } = useNostrSubscriptionWithRelays(
    createSubscription,
    deps,
    enabled,
  );
  const noteEvents = useMemo(() => filterNoteEvents(events), [events]);

  return { noteEvents, relayHintsByEventId };
}
