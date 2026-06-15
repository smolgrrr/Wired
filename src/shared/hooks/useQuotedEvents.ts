import { useEffect, useMemo, useState } from "react";
import type { Event } from "nostr-tools";
import { subQuotedEventsOnce } from "../../nostr/subscriptions";
import { extractQuotedRefs, type QuotedRef } from "@lib/quotedEvents";

type QuotedEventsState = {
  quotedEvents: Event[];
  pendingRefs: QuotedRef[];
  failedRefs: QuotedRef[];
};

const EMPTY_STATE: QuotedEventsState = {
  quotedEvents: [],
  pendingRefs: [],
  failedRefs: [],
};

export function useQuotedEvents(event: Event): QuotedEventsState {
  const quotedRefs = useMemo(() => extractQuotedRefs(event), [event]);
  const [quotedById, setQuotedById] = useState<Map<string, Event>>(() => new Map());
  const [eoseSeen, setEoseSeen] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (quotedRefs.length === 0) {
      setQuotedById(new Map());
      setEoseSeen(new Set());
      return;
    }

    setQuotedById(new Map());
    setEoseSeen(new Set());

    let cancelled = false;
    let handle: { close: () => void } | null = null;

    const onEvent = (quoted: Event) => {
      if (cancelled) return;
      setQuotedById((current) => {
        if (current.has(quoted.id)) return current;
        return new Map(current).set(quoted.id, quoted);
      });
    };

    const onEose = (refId: string) => {
      if (cancelled) return;
      setEoseSeen((current) => {
        if (current.has(refId)) return current;
        return new Set(current).add(refId);
      });
    };

    void subQuotedEventsOnce(quotedRefs, onEvent, onEose).then((subscription) => {
      if (cancelled) {
        subscription.close();
        return;
      }
      handle = subscription;
    });

    return () => {
      cancelled = true;
      handle?.close();
    };
  }, [quotedRefs]);

  return useMemo(() => {
    if (quotedRefs.length === 0) return EMPTY_STATE;

    return {
      quotedEvents: quotedRefs
        .map((ref) => quotedById.get(ref.id))
        .filter((quoted): quoted is Event => quoted !== undefined),
      pendingRefs: quotedRefs.filter(
        (ref) => !quotedById.has(ref.id) && !eoseSeen.has(ref.id),
      ),
      failedRefs: quotedRefs.filter(
        (ref) => eoseSeen.has(ref.id) && !quotedById.has(ref.id),
      ),
    };
  }, [quotedRefs, quotedById, eoseSeen]);
}