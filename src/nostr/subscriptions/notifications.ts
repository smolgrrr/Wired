import { POW_RELAYS } from "../../config";
import { startFiniteQuery } from "../client";
import { DEFAULT_BROWSER_QUERY_DEADLINE_MS } from "../browser-relay-access";
import type { SubCallback, SubHandle } from "../types";
import {
  createSubHandleOwner,
  emptySubHandle,
  finiteQuerySubHandle,
} from "./utils";

export const subNotifications = (
  pubkeys: string[],
  onEvent: SubCallback,
  onEose?: () => void,
  options: { relayUrls?: readonly string[] } = {},
): SubHandle => {
  if (pubkeys.length === 0) {
    return emptySubHandle("notifications:empty");
  }

  const owner = createSubHandleOwner("notifications");
  const relayUrls = options.relayUrls ?? POW_RELAYS;
  let completedQueries = 0;
  const handleCompletion = () => {
    completedQueries += 1;
    if (completedQueries >= 2) {
      onEose?.();
    }
  };

  const filters = [
    {
      authors: pubkeys,
      kinds: [1],
      limit: 25,
    },
    {
      "#p": pubkeys,
      kinds: [1],
      limit: 50,
    },
  ];

  filters.forEach((filter, index) => {
    const query = startFiniteQuery({
      workflowOwner: "wired.browser.notifications",
      filters: [filter],
      coverage: {
        configuredRelayUrls: relayUrls,
        hintedRelayUrls: [],
      },
      completionDeadlineMs: DEFAULT_BROWSER_QUERY_DEADLINE_MS,
      onEvent,
      onComplete: (completion) => {
        if (completion.reason !== "cancelled") handleCompletion();
      },
    });
    owner.add(finiteQuerySubHandle(`notifications:${index}`, query));
  });

  return owner.handle();
};
