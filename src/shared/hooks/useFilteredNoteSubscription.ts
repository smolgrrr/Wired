import { useMemo, type DependencyList } from "react";
import type { Event } from "nostr-tools";
import type { SubCallback, SubHandle } from "../../nostr/types";
import { filterNoteEvents } from "@lib/noteEvents";
import { useNostrSubscription } from "./useNostrSubscription";

export function useFilteredNoteSubscription(
  createSubscription: (onEvent: SubCallback) => SubHandle | Promise<SubHandle>,
  deps: DependencyList,
  enabled = true,
  options?: Parameters<typeof useNostrSubscription>[3],
): Event[] {
  const rawEvents = useNostrSubscription(createSubscription, deps, enabled, options);
  return useMemo(() => filterNoteEvents(rawEvents), [rawEvents]);
}
