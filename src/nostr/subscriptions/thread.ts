import { getRegistry } from "../client";
import type { SubCallback, SubHandle } from "../types";
import { composeSubHandle } from "./utils";

export const subNote = (eventId: string, onEvent: SubCallback): SubHandle => {
  const registry = getRegistry();
  const children: SubHandle[] = [];
  let replyHandle: SubHandle | null = null;
  const replies = new Set<string>([eventId]);

  const refreshReplySubscription = () => {
    replyHandle?.close();
    replyHandle = registry.subscribe([
      {
        filter: {
          "#e": Array.from(replies),
          kinds: [1],
        },
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
        cb: onEvent,
        closeOnEose: true,
      },
    ]),
  );

  refreshReplySubscription();

  return composeSubHandle(`thread:${eventId}`, children, () => replyHandle?.close());
};