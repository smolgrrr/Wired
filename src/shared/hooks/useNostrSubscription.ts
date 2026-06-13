import { useEffect, useState, type DependencyList } from "react";
import type { Event } from "nostr-tools";
import type { SubCallback, SubHandle } from "../../nostr/types";

export function useNostrSubscription(
  createSubscription: (onEvent: SubCallback) => SubHandle,
  deps: DependencyList,
  enabled = true,
): Event[] {
  const [events, setEvents] = useState<Event[]>([]);

  useEffect(() => {
    if (!enabled) {
      setEvents([]);
      return;
    }

    setEvents([]);

    const onEvent = (event: Event) => {
      setEvents((current) => [...current, event]);
    };

    const subscription = createSubscription(onEvent);
    return () => subscription.close();
    // Subscription factory is intentionally excluded; callers pass deps explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  return events;
}