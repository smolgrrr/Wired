import type { SubscriptionRegistry } from "../subscription-registry";
import type { SubCallback, SubHandle } from "../types";

export const subNote = (
  registry: SubscriptionRegistry,
  eventId: string,
  onEvent: SubCallback,
): SubHandle => {
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

  return {
    id: `thread:${eventId}`,
    close: () => {
      replyHandle?.close();
      children.forEach((child) => child.close());
    },
  };
};