import type { SubscriptionRegistry } from "../subscription-registry";
import type { SubCallback, SubHandle } from "../types";

export const subNotesOnce = (
  registry: SubscriptionRegistry,
  eventIds: string[],
  onEvent: SubCallback,
): SubHandle => {
  if (eventIds.length === 0) {
    return { id: "notes-once:empty", close: () => {} };
  }

  return registry.subscribe([
    {
      filter: {
        ids: eventIds,
        kinds: [1],
        limit: eventIds.length,
      },
      cb: onEvent,
      closeOnEose: true,
    },
  ]);
};