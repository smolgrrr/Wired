import { DEFAULT_RELAYS, QUOTE_FALLBACK_RELAYS } from "../../config";
import { ensureRelaysConnected, getRegistry } from "../client";
import type { SubCallback, SubHandle } from "../types";
import type { QuotedRef } from "@lib/quotedEvents";
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

function relayUrlsForQuote(ref: QuotedRef): string[] {
  return [...new Set([...DEFAULT_RELAYS, ...ref.relays, ...QUOTE_FALLBACK_RELAYS])];
}

export async function subQuotedEventsOnce(
  refs: QuotedRef[],
  onEvent: SubCallback,
  onEose?: (refId: string) => void,
): Promise<SubHandle> {
  if (refs.length === 0) {
    return emptySubHandle("quoted-events-once:empty");
  }

  const relayUrls = [...new Set(refs.flatMap(relayUrlsForQuote))];
  await ensureRelaysConnected(relayUrls);

  return getRegistry().subscribe(
    refs.map((ref) => ({
      filter: {
        ids: [ref.id],
        kinds: [1, 1068],
        limit: 1,
      },
      cb: onEvent,
      closeOnEose: true,
      onEose: onEose ? () => onEose(ref.id) : undefined,
      relayUrls: relayUrlsForQuote(ref),
    })),
  );
}