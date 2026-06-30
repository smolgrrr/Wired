import { getRegistry, THREAD_RELAYS } from "../client";
import type { SubCallback, SubHandle } from "../types";
import { composeSubHandle } from "./utils";
import { buildThreadReplyFilter } from "./query-limits";
import { uniqueRelays } from "@lib/threadRefs";

export const subNote = (
  eventId: string,
  onEvent: SubCallback,
  relayHints: readonly string[] = [],
): SubHandle => {
  const registry = getRegistry();
  const children: SubHandle[] = [];
  let replyHandle: SubHandle | null = null;
  const replies = new Set<string>([eventId]);
  const relayUrls = uniqueRelays([...THREAD_RELAYS, ...relayHints]);

  const refreshReplySubscription = () => {
    const filter = buildThreadReplyFilter(Array.from(replies));
    if (!filter) return;

    replyHandle?.close();
    replyHandle = registry.subscribe([
      {
        filter,
        relayUrls,
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
        relayUrls,
        cb: onEvent,
        closeOnEose: true,
      },
    ]),
  );

  refreshReplySubscription();

  return composeSubHandle(`thread:${eventId}`, children, () => replyHandle?.close());
};
