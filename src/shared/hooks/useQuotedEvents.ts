import { useEffect, useMemo, useState } from "react";
import type { Event } from "nostr-tools";
import { subQuotedEventsOnce } from "../../nostr/subscriptions";
import { extractQuotedRefs, type QuotedRef } from "@lib/quotedEvents";
import {
  loadFeedBootstrapSnapshot,
  snapshotEventById,
} from "../lib/feedBootstrapClient";
import { seedProfiles } from "./useProfiles";

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
        const next = new Map(current).set(quoted.id, quoted);
        return next;
      });
    };

    const onEose = (refId: string) => {
      if (cancelled) return;
      setEoseSeen((current) => {
        if (current.has(refId)) return current;
        return new Set(current).add(refId);
      });
    };

    void loadFeedBootstrapSnapshot().then((snapshot) => {
      if (cancelled) return;

      const snapshotEvents = snapshot ? snapshotEventById(snapshot) : new Map<string, Event>();
      if (snapshot) seedProfiles(snapshot.profiles);
      const refsMissingFromSnapshot: QuotedRef[] = [];
      const nextQuotedById = new Map<string, Event>();

      quotedRefs.forEach((ref) => {
        const quoted = snapshotEvents.get(ref.id);
        if (quoted) {
          nextQuotedById.set(quoted.id, quoted);
          return;
        }
        refsMissingFromSnapshot.push(ref);
      });

      setQuotedById(nextQuotedById);

      if (refsMissingFromSnapshot.length === 0) {
        return;
      }

      void subQuotedEventsOnce(refsMissingFromSnapshot, onEvent, onEose).then(
        (subscription) => {
          if (cancelled) {
            subscription.close();
            return;
          }
          handle = subscription;
        },
      );
    }).catch(() => {
      if (cancelled) return;
      void subQuotedEventsOnce(quotedRefs, onEvent, onEose).then((subscription) => {
        if (cancelled) {
          subscription.close();
          return;
        }
        handle = subscription;
      });
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
