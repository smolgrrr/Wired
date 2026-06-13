import type { SubscriptionRegistry } from "../subscription-registry";
import type { SubCallback, SubHandle } from "../types";

export const subPoll = (
  registry: SubscriptionRegistry,
  eventId: string,
  onEvent: SubCallback,
): SubHandle => {
  return registry.subscribe([
    {
      filter: {
        "#e": [eventId],
        kinds: [1018],
      },
      cb: onEvent,
      closeOnEose: true,
    },
  ]);
};