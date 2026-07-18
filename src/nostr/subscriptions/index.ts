import { POW_RELAYS, QUOTE_FALLBACK_RELAYS } from "../../config";
import {
  ensureRelaysConnected,
  initNostr,
  PROFILE_RELAYS,
  THREAD_RELAYS,
  getRegistry,
  startFiniteQuery,
} from "../client";
import { DEFAULT_BROWSER_QUERY_DEADLINE_MS } from "../browser-relay-access";
import type { SubCallback, SubHandle } from "../types";
import type { QuotedRef } from "@lib/quotedEvents";
import {
  createSubHandleOwner,
  emptySubHandle,
  finiteQuerySubHandle,
} from "./utils";
import { profileQueryLimit } from "./query-limits";

export type { SubCallback, SubHandle };

export { subGlobalFeed, subRepliesForRootIds } from "./global-feed";
export { subNote } from "./thread";
export { subNotifications } from "./notifications";

export const subNotesOnce = (
  eventIds: string[],
  onEvent: SubCallback,
  relayUrls: readonly string[] = THREAD_RELAYS,
): SubHandle => {
  if (eventIds.length === 0) {
    return emptySubHandle("notes-once:empty");
  }

  return finiteQuerySubHandle(
    "notes-once",
    startFiniteQuery({
      workflowOwner: "wired.browser.thread",
      filters: [{
        ids: eventIds,
        kinds: [1],
        limit: eventIds.length,
      }],
      coverage: {
        configuredRelayUrls: relayUrls,
        hintedRelayUrls: [],
      },
      completionDeadlineMs: DEFAULT_BROWSER_QUERY_DEADLINE_MS,
      onEvent,
    }),
  );
};

export async function subProfilesOnce(
  pubkeys: string[],
  onEvent: SubCallback,
  onEose?: () => void,
  options: { relayUrls?: readonly string[] } = {},
): Promise<SubHandle> {
  if (pubkeys.length === 0) {
    return emptySubHandle("profiles-once:empty");
  }

  if (options.relayUrls) {
    await ensureRelaysConnected(options.relayUrls);
  } else {
    await initNostr();
  }

  return getRegistry().subscribe([
    {
      filter: {
        authors: pubkeys,
        kinds: [0],
        limit: profileQueryLimit(pubkeys.length),
      },
      cb: onEvent,
      closeOnEose: true,
      onEose,
      relayUrls: options.relayUrls ?? PROFILE_RELAYS,
    },
  ]);
}

function uniqueRelayUrls(relays: readonly string[]): string[] {
  return [...new Set(relays)];
}

function fallbackRelayUrlsForQuote(
  fallbackRelayUrls: readonly string[] = [...POW_RELAYS, ...QUOTE_FALLBACK_RELAYS],
): string[] {
  return uniqueRelayUrls(fallbackRelayUrls);
}

function extraRelayHintsForQuote(
  ref: QuotedRef,
  fallbackRelayUrls: readonly string[] = [...POW_RELAYS, ...QUOTE_FALLBACK_RELAYS],
): string[] {
  const fallbackRelays = new Set(fallbackRelayUrls);
  return uniqueRelayUrls(ref.relays.filter((relay) => !fallbackRelays.has(relay)));
}

export async function subQuotedEventsOnce(
  refs: QuotedRef[],
  onEvent: SubCallback,
  onEose?: (refId: string) => void,
  options: { fallbackRelayUrls?: readonly string[] } = {},
): Promise<SubHandle> {
  if (refs.length === 0) {
    return emptySubHandle("quoted-events-once:empty");
  }

  const fallbackRelayUrls = options.fallbackRelayUrls ?? [
    ...POW_RELAYS,
    ...QUOTE_FALLBACK_RELAYS,
  ];
  if (options.fallbackRelayUrls) {
    await ensureRelaysConnected(fallbackRelayUrls);
  } else {
    await initNostr();
  }

  const owner = createSubHandleOwner("quoted-events-once");
  refs.forEach((ref) => {
    const query = startFiniteQuery({
      workflowOwner: "wired.browser.quotes",
      filters: [{
        ids: [ref.id],
        kinds: [1, 1068],
        limit: 1,
      }],
      coverage: {
        configuredRelayUrls: fallbackRelayUrlsForQuote(fallbackRelayUrls),
        hintedRelayUrls: extraRelayHintsForQuote(ref, fallbackRelayUrls),
      },
      completionDeadlineMs: DEFAULT_BROWSER_QUERY_DEADLINE_MS,
      onEvent,
      onComplete: (completion) => {
        if (completion.reason !== "cancelled") onEose?.(ref.id);
      },
    });
    owner.add(finiteQuerySubHandle(`quoted-event:${ref.id}`, query));
  });

  return owner.handle();
}
