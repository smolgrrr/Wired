import type { Event } from "nostr-tools";
import { DYNAMIC_CONTEXT_HINTS_ENABLED, THREAD_RELAYS } from "../../config";
import type { QuotedRef } from "@lib/quotedEvents";
import {
  prepareRelayConnections,
  startFiniteQuery,
} from "../client";
import { DEFAULT_BROWSER_QUERY_DEADLINE_MS } from "../browser-relay-access";
import { uniqueRelayUrls } from "../feed-candidates";
import type { SubCallback, SubHandle } from "../types";
import {
  createSubHandleOwner,
  emptySubHandle,
  finiteQuerySubHandle,
} from "./utils";

type ReferencedContextOptions = {
  relayUrls?: readonly string[];
  dynamicHints?: boolean;
};

type HintPlan = {
  ids: string[];
  relayUrl: string;
};

function mergeRefs(refs: readonly QuotedRef[]): QuotedRef[] {
  const relaysById = new Map<string, string[]>();
  refs.forEach((ref) => {
    const id = ref.id.toLowerCase();
    relaysById.set(id, uniqueRelayUrls([
      ...(relaysById.get(id) ?? []),
      ...ref.relays,
    ]));
  });
  return [...relaysById.entries()].map(([id, relays]) => ({ id, relays }));
}

function hintPlans(
  refs: readonly QuotedRef[],
  configuredRelayUrls: readonly string[],
): HintPlan[] {
  const configured = new Set(configuredRelayUrls);
  const idsByRelay = new Map<string, Set<string>>();
  refs.forEach((ref) => {
    ref.relays
      .filter((relayUrl) => !configured.has(relayUrl))
      .forEach((relayUrl) => {
        const ids = idsByRelay.get(relayUrl) ?? new Set<string>();
        ids.add(ref.id);
        idsByRelay.set(relayUrl, ids);
      });
  });
  return [...idsByRelay.entries()].map(([relayUrl, ids]) => ({
    ids: [...ids],
    relayUrl,
  }));
}

export function subReferencedEventsOnce(
  refs: readonly QuotedRef[],
  onEvent: SubCallback,
  options: ReferencedContextOptions = {},
): SubHandle {
  const mergedRefs = mergeRefs(refs);
  if (mergedRefs.length === 0) {
    return emptySubHandle("referenced-context:empty");
  }

  const owner = createSubHandleOwner("referenced-context");
  const configuredRelayUrls = uniqueRelayUrls(
    options.relayUrls ?? THREAD_RELAYS,
  );
  const plans = hintPlans(mergedRefs, configuredRelayUrls);
  const preparations = new Map<
    string,
    ReturnType<typeof prepareRelayConnections>
  >();
  const receivedIds = new Set<string>();
  let closed = false;
  const expectedIds = new Set(mergedRefs.map((ref) => ref.id));
  const acceptExpectedEvent = (event: Event, relayUrl: string) => {
    const id = event.id.toLowerCase();
    if (!expectedIds.has(id) || receivedIds.has(id)) return;
    receivedIds.add(id);
    onEvent(event, relayUrl);
  };
  const startHintQueries = () => {
    plans.forEach((plan) => {
      void (preparations.get(plan.relayUrl)?.done ?? Promise.resolve())
        .then((preparation) => {
          if (closed) return;
          if (
            preparation &&
            !preparation.targets.some((target) => target.state === "connected")
          ) return;
          const missingIds = plan.ids.filter((id) => !receivedIds.has(id));
          if (missingIds.length === 0) return;
          const expectedHintIds = new Set(missingIds);
          const query = startFiniteQuery({
            workflowOwner: "wired.browser.thread",
            filters: [{
              ids: missingIds,
              kinds: [1],
              limit: missingIds.length,
            }],
            coverage: {
              configuredRelayUrls: [plan.relayUrl],
              hintedRelayUrls: [],
            },
            completionDeadlineMs: DEFAULT_BROWSER_QUERY_DEADLINE_MS,
            onEvent: (event, relayUrl) => {
              if (!expectedHintIds.has(event.id.toLowerCase())) return;
              acceptExpectedEvent(event, relayUrl);
            },
          });
          owner.add(finiteQuerySubHandle(
            `referenced-context-hint:${plan.relayUrl}`,
            query,
          ));
        });
    });
  };

  const configuredQuery = startFiniteQuery({
    workflowOwner: "wired.browser.thread",
    filters: [{
      ids: mergedRefs.map((ref) => ref.id),
      kinds: [1],
      limit: mergedRefs.length,
    }],
    coverage: {
      configuredRelayUrls,
      hintedRelayUrls: [],
    },
    completionDeadlineMs: DEFAULT_BROWSER_QUERY_DEADLINE_MS,
    onEvent: acceptExpectedEvent,
    onComplete: (completion) => {
      if (
        completion.reason !== "cancelled" &&
        (options.dynamicHints ?? DYNAMIC_CONTEXT_HINTS_ENABLED)
      ) {
        queueMicrotask(startHintQueries);
      }
    },
  });
  owner.add(finiteQuerySubHandle("referenced-context-configured", configuredQuery));

  if (options.dynamicHints ?? DYNAMIC_CONTEXT_HINTS_ENABLED) {
    plans.forEach((plan) => {
      const preparation = prepareRelayConnections(
        [plan.relayUrl],
        "wired.browser.thread",
      );
      preparations.set(plan.relayUrl, preparation);
      owner.add({
        id: `referenced-context-connection:${plan.relayUrl}`,
        close: preparation.close,
      });
    });
  }

  const handle = owner.handle();
  return {
    id: handle.id,
    close() {
      closed = true;
      handle.close();
    },
  };
}
