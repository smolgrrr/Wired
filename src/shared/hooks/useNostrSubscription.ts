import { useEffect, useState, type DependencyList } from "react";
import type { Event } from "nostr-tools";
import type { SubCallback, SubHandle } from "../../nostr/types";

function mergeEvents(current: Event[], incoming: Event[]): Event[] {
  if (incoming.length === 0) return current;

  const seen = new Set(current.map((event) => event.id));
  const next = [...current];

  for (const event of incoming) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    next.push(event);
  }

  return next.length === current.length ? current : next;
}

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

    const pending: Event[] = [];
    let flushScheduled = false;

    const flushPending = () => {
      flushScheduled = false;
      if (pending.length === 0) return;

      const batch = pending.splice(0);
      setEvents((current) => mergeEvents(current, batch));
    };

    const onEvent = (event: Event) => {
      pending.push(event);
      if (!flushScheduled) {
        flushScheduled = true;
        queueMicrotask(flushPending);
      }
    };

    const subscription = createSubscription(onEvent);
    return () => subscription.close();
    // Subscription factory is intentionally excluded; callers pass deps explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  return events;
}