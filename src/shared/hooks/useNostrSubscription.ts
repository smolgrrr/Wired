import { useEffect, useState, type DependencyList } from "react";
import type { Event } from "nostr-tools";
import { initNostr } from "../../nostr/client";
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

    let cancelled = false;
    let subscription: SubHandle | null = null;

    void initNostr().then(() => {
      if (cancelled) return;

      setEvents([]);

      const onEvent = (event: Event) => {
        setEvents((current) =>
          current.some((e) => e.id === event.id) ? current : [...current, event],
        );
      };

      subscription = createSubscription(onEvent);
    });

    return () => {
      cancelled = true;
      subscription?.close();
    };
    // Subscription factory is intentionally excluded; callers pass deps explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  return events;
}