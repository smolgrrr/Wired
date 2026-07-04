import { POW_RELAYS, QUOTE_FALLBACK_RELAYS } from "../../config";
import {
  ensureRelaysConnected,
  initNostr,
  PROFILE_RELAYS,
  THREAD_RELAYS,
  getRegistry,
} from "../client";
import type { SubCallback, SubHandle } from "../types";
import type { QuotedRef } from "@lib/quotedEvents";
import { createSubHandleOwner, emptySubHandle } from "./utils";
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

  return getRegistry().subscribe([
    {
      filter: {
        ids: eventIds,
        kinds: [1],
        limit: eventIds.length,
      },
      relayUrls,
      cb: onEvent,
      closeOnEose: true,
    },
  ]);
};

export async function subProfilesOnce(
  pubkeys: string[],
  onEvent: SubCallback,
  onEose?: () => void,
): Promise<SubHandle> {
  if (pubkeys.length === 0) {
    return emptySubHandle("profiles-once:empty");
  }

  await initNostr();

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
      relayUrls: PROFILE_RELAYS,
    },
  ]);
}

function uniqueRelayUrls(relays: readonly string[]): string[] {
  return [...new Set(relays)];
}

function fallbackRelayUrlsForQuote(ref: QuotedRef): string[] {
  return uniqueRelayUrls([...POW_RELAYS, ...QUOTE_FALLBACK_RELAYS, ...ref.relays]);
}

function extraRelayHintsForQuote(ref: QuotedRef): string[] {
  const fallbackRelays = new Set([...POW_RELAYS, ...QUOTE_FALLBACK_RELAYS]);
  return uniqueRelayUrls(ref.relays.filter((relay) => !fallbackRelays.has(relay)));
}

function hasExtraRelayHints(ref: QuotedRef): boolean {
  return extraRelayHintsForQuote(ref).length > 0;
}

function quoteRequests(
  refs: QuotedRef[],
  onEvent: SubCallback,
  onEose: ((refId: string) => void) | undefined,
  relayUrlsForRef: (ref: QuotedRef) => string[],
  shouldReportEose: (ref: QuotedRef) => boolean = () => true,
) {
  return refs.map((ref) => ({
    filter: {
      ids: [ref.id],
      kinds: [1, 1068],
      limit: 1,
    },
    cb: onEvent,
    closeOnEose: true,
    onEose: onEose && shouldReportEose(ref) ? () => onEose(ref.id) : undefined,
    relayUrls: relayUrlsForRef(ref),
  }));
}

export async function subQuotedEventsOnce(
  refs: QuotedRef[],
  onEvent: SubCallback,
  onEose?: (refId: string) => void,
): Promise<SubHandle> {
  if (refs.length === 0) {
    return emptySubHandle("quoted-events-once:empty");
  }

  await initNostr();

  const owner = createSubHandleOwner("quoted-events-once");
  const refsWithExtraHints = refs.filter(hasExtraRelayHints);

  owner.add(
    getRegistry().subscribe(
      quoteRequests(
        refs,
        onEvent,
        onEose,
        fallbackRelayUrlsForQuote,
        (ref) => !hasExtraRelayHints(ref),
      ),
    ),
  );

  if (refsWithExtraHints.length > 0) {
    const extraRelayHints = uniqueRelayUrls(
      refsWithExtraHints.flatMap(extraRelayHintsForQuote),
    );
    void ensureRelaysConnected(extraRelayHints)
      .then(() => {
        owner.add(
          getRegistry().subscribe(
            quoteRequests(refsWithExtraHints, onEvent, onEose, extraRelayHintsForQuote),
          ),
        );
      })
      .catch(() => {});
  }

  return owner.handle();
}
