import { useEffect, useState, type DependencyList } from "react";
import type { Event } from "nostr-tools";
import { initNostr } from "../../nostr/client";
import type { RelayHintsByEventId, SubCallback, SubHandle } from "../../nostr/types";

type SubscriptionFactory = (onEvent: SubCallback) => SubHandle | Promise<SubHandle>;

export type NostrSubscriptionState = {
  events: Event[];
  relayHintsByEventId: RelayHintsByEventId;
};

function normalizeRelayUrl(relay: string): string {
  return relay.replace(/\/+$/, "");
}

export function useNostrSubscriptionWithRelays(
  createSubscription: SubscriptionFactory,
  deps: DependencyList,
  enabled = true,
): NostrSubscriptionState {
  const [events, setEvents] = useState<Event[]>([]);
  const [relayHintsByEventId, setRelayHintsByEventId] = useState<Map<string, string[]>>(
    () => new Map(),
  );

  useEffect(() => {
    if (!enabled) {
      setEvents([]);
      setRelayHintsByEventId(new Map());
      return;
    }

    let cancelled = false;
    let subscription: SubHandle | null = null;

    void initNostr().then(() => {
      if (cancelled) return;

      setEvents([]);
      setRelayHintsByEventId(new Map());

      const onEvent = (event: Event, relay: string) => {
        setEvents((current) =>
          current.some((e) => e.id === event.id) ? current : [...current, event],
        );

        if (!relay) return;
        const normalizedRelay = normalizeRelayUrl(relay);
        if (!normalizedRelay) return;

        setRelayHintsByEventId((current) => {
          const existing = current.get(event.id) ?? [];
          if (existing.includes(normalizedRelay)) return current;

          const next = new Map(current);
          next.set(event.id, [...existing, normalizedRelay]);
          return next;
        });
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
  }, [enabled, ...deps]);

  return { events, relayHintsByEventId };
}

export function useNostrSubscription(
  createSubscription: SubscriptionFactory,
  deps: DependencyList,
  enabled = true,
): Event[] {
  return useNostrSubscriptionWithRelays(createSubscription, deps, enabled).events;
}
