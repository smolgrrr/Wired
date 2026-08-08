import {
  COMPLETE_PROFILE_BATCHES_ENABLED,
  POW_RELAYS,
  QUOTE_FALLBACK_RELAYS,
} from "../../config";
import {
  ensureRelaysConnected,
  initNostr,
  PROFILE_RELAYS,
  THREAD_RELAYS,
  startFiniteQuery,
} from "../client";
import { DEFAULT_BROWSER_QUERY_DEADLINE_MS } from "../browser-relay-access";
import type { QueryCompletion } from "../browser-relay-access";
import type { SubCallback, SubHandle } from "../types";
import type { QuotedRef } from "@lib/quotedEvents";
import {
  createSubHandleOwner,
  emptySubHandle,
  finiteQuerySubHandle,
} from "./utils";
import { chunkProfilePubkeys, profileQueryLimit } from "./query-limits";

export type { SubCallback, SubHandle };

export { subGlobalFeed, subRepliesForRootIds } from "./global-feed";
export type { FeedTraversalCompletion } from "./global-feed";
export { subReferencedEventsOnce } from "./context";
export { subNote } from "./thread";
export type { ThreadTraversalCompletion } from "./thread";
export { subNotifications } from "./notifications";
import { subReferencedEventsOnce } from "./context";

export const subNotesOnce = (
  eventIds: string[],
  onEvent: SubCallback,
  relayUrls: readonly string[] = THREAD_RELAYS,
): SubHandle => subReferencedEventsOnce(
  eventIds.map((id) => ({ id, relays: [] })),
  onEvent,
  { relayUrls },
);

export async function subProfilesOnce(
  pubkeys: string[],
  onEvent: SubCallback,
  onEose?: () => void,
  options: {
    relayUrls?: readonly string[];
    onComplete?: (completion: QueryCompletion) => void;
  } = {},
): Promise<SubHandle> {
  let chunks: string[][] = [];
  if (pubkeys.length > 0) {
    chunks = COMPLETE_PROFILE_BATCHES_ENABLED
      ? chunkProfilePubkeys(pubkeys)
      : [pubkeys];
  }
  if (chunks.length === 0) {
    return emptySubHandle("profiles-once:empty");
  }

  const owner = createSubHandleOwner("profiles-once");
  const handle = owner.handle();
  const completions: Array<QueryCompletion | undefined> = Array(chunks.length)
    .fill(undefined);
  try {
    chunks.forEach((chunk, index) => {
      const query = startFiniteQuery({
        workflowOwner: "wired.browser.profiles",
        filters: [{
          authors: chunk,
          kinds: [0],
          limit: profileQueryLimit(chunk.length),
        }],
        coverage: {
          configuredRelayUrls: options.relayUrls ?? PROFILE_RELAYS,
          hintedRelayUrls: [],
        },
        completionDeadlineMs: DEFAULT_BROWSER_QUERY_DEADLINE_MS,
        onEvent,
        onComplete: (completion) => {
          completions[index] = completion;
          if (completions.some((candidate) => candidate === undefined)) return;
          const completed = completions as QueryCompletion[];
          const aggregate: QueryCompletion = {
            reason: completed.some(({ reason }) => reason === "cancelled")
              ? "cancelled"
              : completed.some(({ reason }) => reason === "deadline")
              ? "deadline"
              : "settled",
            targets: completed.flatMap(({ targets }) => targets),
            receivedEvents: completed.reduce(
              (total, candidate) => total + candidate.receivedEvents,
              0,
            ),
          };
          options.onComplete?.(aggregate);
          if (aggregate.reason !== "cancelled") onEose?.();
        },
      });
      owner.add(finiteQuerySubHandle(`profiles-once:${index}`, query));
    });
  } catch (error) {
    handle.close();
    throw error;
  }
  return handle;
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
