import { getRegistry } from "../client";
import type { SubCallback, SubHandle } from "../types";
import { emptySubHandle } from "./utils";

export const subNotifications = (
  pubkeys: string[],
  onEvent: SubCallback,
  onEose?: () => void,
  options: { relayUrls?: readonly string[] } = {},
): SubHandle => {
  if (pubkeys.length === 0) {
    return emptySubHandle("notifications:empty");
  }

  let eoseCount = 0;
  const handleEose = () => {
    eoseCount += 1;
    if (eoseCount >= 2) {
      onEose?.();
    }
  };

  return getRegistry().subscribe([
    {
      filter: {
        authors: pubkeys,
        kinds: [1, 7],
        limit: 25,
      },
      cb: onEvent,
      closeOnEose: true,
      onEose: handleEose,
      relayUrls: options.relayUrls,
    },
    {
      filter: {
        "#p": pubkeys,
        kinds: [1],
        limit: 50,
      },
      cb: onEvent,
      closeOnEose: true,
      onEose: handleEose,
      relayUrls: options.relayUrls,
    },
  ]);
};
