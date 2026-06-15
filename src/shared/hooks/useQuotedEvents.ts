import { useMemo } from "react";
import type { Event } from "nostr-tools";
import { subQuotedEventsOnce } from "../../nostr/subscriptions";
import { extractQuotedEventIds } from "@lib/quotedEvents";
import { useNostrSubscription } from "./useNostrSubscription";

export function useQuotedEvents(event: Event): Event[] {
  const quotedIds = useMemo(() => extractQuotedEventIds(event), [event]);

  const fetched = useNostrSubscription(
    (onEvent) => subQuotedEventsOnce(quotedIds, onEvent),
    [quotedIds.join(",")],
    quotedIds.length > 0,
  );

  return useMemo(() => {
    const byId = new Map(fetched.map((quoted) => [quoted.id, quoted]));
    return quotedIds
      .map((id) => byId.get(id))
      .filter((quoted): quoted is Event => quoted !== undefined);
  }, [fetched, quotedIds]);
}