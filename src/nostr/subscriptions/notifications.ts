import { getRegistry } from "../client";
import type { SubCallback, SubHandle } from "../types";
import { emptySubHandle } from "./utils";

export const subNotifications = (pubkeys: string[], onEvent: SubCallback): SubHandle => {
  if (pubkeys.length === 0) {
    return emptySubHandle("notifications:empty");
  }

  return getRegistry().subscribe([
    {
      filter: {
        authors: pubkeys,
        kinds: [1, 7],
        limit: 25,
      },
      cb: onEvent,
      closeOnEose: true,
    },
    {
      filter: {
        "#p": pubkeys,
        kinds: [1],
        limit: 50,
      },
      cb: onEvent,
      closeOnEose: true,
    },
  ]);
};