import { getRegistry } from "../client";
import type { SubCallback, SubHandle } from "../types";
import { emptySubHandle } from "./utils";

export type { SubCallback, SubHandle };

export { subGlobalFeed } from "./global-feed";
export { subNote } from "./thread";
export { subNotifications } from "./notifications";

export const subPoll = (eventId: string, onEvent: SubCallback): SubHandle =>
  getRegistry().subscribe([
    {
      filter: {
        "#e": [eventId],
        kinds: [1018],
      },
      cb: onEvent,
      closeOnEose: true,
    },
  ]);

export const subNotesOnce = (eventIds: string[], onEvent: SubCallback): SubHandle => {
  if (eventIds.length === 0) {
    return emptySubHandle("notes-once:empty");
  }

  return getRegistry().subscribe([
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