import { useEffect, useState, type DependencyList } from "react";
import type { Event } from "nostr-tools";
import { initNostr } from "../../nostr/client";
import type { SubCallback, SubHandle } from "../../nostr/types";

type SubscriptionFactory = (onEvent: SubCallback) => SubHandle | Promise<SubHandle>;

type NostrSubscriptionOptions = {
  initialize?: boolean;
};

export function useNostrSubscription(
  createSubscription: SubscriptionFactory,
  deps: DependencyList,
  enabled = true,
  options: NostrSubscriptionOptions = {},
): Event[] {
  const [events, setEvents] = useState<Event[]>([]);
  const { initialize = true } = options;

  useEffect(() => {
    if (!enabled) {
      setEvents([]);
      return;
    }

    let cancelled = false;
    let subscription: SubHandle | null = null;

    const prepareSubscription = initialize ? initNostr() : Promise.resolve();

    void prepareSubscription.then(() => {
      if (cancelled) return;

      setEvents([]);

      const onEvent = (event: Event) => {
        setEvents((current) =>
          current.some((e) => e.id === event.id) ? current : [...current, event],
        );
      };

      void Promise.resolve(createSubscription(onEvent)).then((nextSubscription) => {
        if (cancelled) {
          nextSubscription.close();
          return;
        }

        subscription = nextSubscription;
      });
    });

    return () => {
      cancelled = true;
      subscription?.close();
    };
    // Subscription factory is intentionally excluded; callers pass deps explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, initialize, ...deps]);

  return events;
}
