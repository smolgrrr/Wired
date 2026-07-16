import { getRegistry, startFiniteQuery, THREAD_RELAYS } from "../client";
import { DEFAULT_BROWSER_QUERY_DEADLINE_MS } from "../browser-relay-access";
import type { SubCallback, SubHandle } from "../types";
import { composeSubHandle, finiteQuerySubHandle } from "./utils";
import { buildThreadReplyFilter } from "./query-limits";
import { uniqueRelays } from "@lib/threadRefs";

type ThreadSubscriptionOptions = {
  configuredRelayUrls?: readonly string[];
  hintedRelayUrls?: readonly string[];
};

export const subNote = (
  eventId: string,
  onEvent: SubCallback,
  relayHints: readonly string[] = [],
  options: ThreadSubscriptionOptions = {},
): SubHandle => {
  const registry = getRegistry();
  const children: SubHandle[] = [];
  let replyHandle: SubHandle | null = null;
  const replies = new Set<string>([eventId]);
  const configuredRelayUrls = options.configuredRelayUrls ?? THREAD_RELAYS;
  const hintedRelayUrls = options.hintedRelayUrls ?? relayHints;
  const relayUrls = uniqueRelays([...configuredRelayUrls, ...hintedRelayUrls]);

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

  const rootQuery = startFiniteQuery({
    workflowOwner: "wired.browser.thread",
    filters: [{
      ids: [eventId],
      kinds: [1, 1068],
      limit: 1,
    }],
    coverage: {
      configuredRelayUrls,
      hintedRelayUrls,
    },
    completionDeadlineMs: DEFAULT_BROWSER_QUERY_DEADLINE_MS,
    onEvent,
  });
  children.push(finiteQuerySubHandle(`thread-root:${eventId}`, rootQuery));

  refreshReplySubscription();

  return composeSubHandle(`thread:${eventId}`, children, () => replyHandle?.close());
};
