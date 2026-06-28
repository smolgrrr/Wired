import { getRegistry, THREAD_RELAYS } from "../client";
import type { SubCallback, SubHandle } from "../types";
import { composeSubHandle } from "./utils";
import {
  buildReplyFilter,
  DEFAULT_THREAD_AGE_HOURS,
  sinceFromAgeHours,
} from "./query-limits";

export const subNote = (
  eventId: string,
  onEvent: SubCallback,
  ageHours = DEFAULT_THREAD_AGE_HOURS,
): SubHandle => {
  const registry = getRegistry();
  const children: SubHandle[] = [];
  let replyHandle: SubHandle | null = null;
  const replies = new Set<string>([eventId]);
  const since = sinceFromAgeHours(ageHours);

  const refreshReplySubscription = () => {
    const filter = buildReplyFilter(Array.from(replies), since);
    if (!filter) return;

    replyHandle?.close();
    replyHandle = registry.subscribe([
      {
        filter,
        relayUrls: THREAD_RELAYS,
        cb: (evt, relay) => {
          const isNew = !replies.has(evt.id);
          if (isNew) {
            replies.add(evt.id);
          }
          onEvent(evt, relay);
          if (isNew) {
            refreshReplySubscription();
          }
        },
      },
    ]);
  };

  children.push(
    registry.subscribe([
      {
        filter: {
          ids: [eventId],
          kinds: [1, 1068],
          limit: 1,
        },
        relayUrls: THREAD_RELAYS,
        cb: onEvent,
        closeOnEose: true,
      },
    ]),
  );

  refreshReplySubscription();

  return composeSubHandle(`thread:${eventId}`, children, () => replyHandle?.close());
};
