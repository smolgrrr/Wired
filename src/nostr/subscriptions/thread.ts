import { COMPLETE_THREAD_TRAVERSAL_ENABLED } from "../../config";
import { getRegistry, startFiniteQuery, THREAD_RELAYS } from "../client";
import {
  DEFAULT_BROWSER_QUERY_DEADLINE_MS,
  type QueryCompletion,
} from "../browser-relay-access";
import type { SubCallback, SubHandle } from "../types";
import { composeSubHandle, finiteQuerySubHandle } from "./utils";
import { buildThreadReplyFilter } from "./query-limits";
import {
  CompleteReplyTraversal,
  MAX_REPLY_TRAVERSAL_PASSES,
  queryCompletionToReplyTraversal,
  type ReplyTraversalCompletion,
} from "./complete-reply-traversal";
import { uniqueRelays } from "@lib/threadRefs";

type ThreadSubscriptionOptions = {
  configuredRelayUrls?: readonly string[];
  hintedRelayUrls?: readonly string[];
  completeTraversal?: boolean;
  onTraversalComplete?: (completion: ThreadTraversalCompletion) => void;
};

export const MAX_THREAD_REPLY_PASSES = MAX_REPLY_TRAVERSAL_PASSES;
export type ThreadTraversalCompletion = ReplyTraversalCompletion;

class ThreadTraversalCompletionCoordinator {
  private rootComplete = false;
  private repliesComplete = false;
  private reported = false;

  constructor(
    private readonly onComplete?: (completion: ThreadTraversalCompletion) => void,
  ) {}

  completeRoot(completion: QueryCompletion): void {
    const result = queryCompletionToReplyTraversal(completion);
    if (result.state === "incomplete") {
      this.report(result);
      return;
    }
    this.rootComplete = true;
    this.maybeReportComplete();
  }

  completeReplies(completion: ThreadTraversalCompletion): void {
    if (completion.state === "incomplete") {
      this.report(completion);
      return;
    }
    this.repliesComplete = true;
    this.maybeReportComplete();
  }

  private maybeReportComplete(): void {
    if (this.rootComplete && this.repliesComplete) {
      this.report({ state: "complete", reason: "fixpoint-eose" });
    }
  }

  private report(completion: ThreadTraversalCompletion): void {
    if (this.reported) return;
    this.reported = true;
    this.onComplete?.(completion);
  }
}

function subNoteComplete(
  eventId: string,
  onEvent: SubCallback,
  configuredRelayUrls: readonly string[],
  hintedRelayUrls: readonly string[],
  options: ThreadSubscriptionOptions,
): SubHandle {
  const children: SubHandle[] = [];
  const deliveredIds = new Set<string>();
  const deliver: SubCallback = (event, relayUrl) => {
    const eventId = event.id.toLowerCase();
    if (deliveredIds.has(eventId)) return;
    deliveredIds.add(eventId);
    onEvent(event, relayUrl);
  };
  const relayUrls = uniqueRelays([
    ...configuredRelayUrls,
    ...hintedRelayUrls,
  ]);
  const completion = new ThreadTraversalCompletionCoordinator(
    options.onTraversalComplete,
  );
  const replies = new CompleteReplyTraversal({
    initialParentIds: [eventId],
    relayUrls,
    onEvent: deliver,
    onComplete: (result) => completion.completeReplies(result),
  });
  children.push(replies.handle);

  children.push(startThreadRootQuery(
    eventId,
    configuredRelayUrls,
    hintedRelayUrls,
    deliver,
    (result) => {
      if (queryCompletionToReplyTraversal(result).state === "complete") {
        replies.confirmCoverage();
      }
      completion.completeRoot(result);
    },
  ));

  return composeSubHandle(`thread:${eventId}`, children);
}

function startThreadRootQuery(
  eventId: string,
  configuredRelayUrls: readonly string[],
  hintedRelayUrls: readonly string[],
  onEvent: SubCallback,
  onComplete?: (completion: QueryCompletion) => void,
): SubHandle {
  const query = startFiniteQuery({
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
    onComplete,
  });
  return finiteQuerySubHandle(`thread-root:${eventId}`, query);
}

export const subNote = (
  eventId: string,
  onEvent: SubCallback,
  relayHints: readonly string[] = [],
  options: ThreadSubscriptionOptions = {},
): SubHandle => {
  const configuredRelayUrls = options.configuredRelayUrls ?? THREAD_RELAYS;
  const hintedRelayUrls = options.hintedRelayUrls ?? relayHints;
  if (options.completeTraversal ?? COMPLETE_THREAD_TRAVERSAL_ENABLED) {
    return subNoteComplete(
      eventId,
      onEvent,
      configuredRelayUrls,
      hintedRelayUrls,
      options,
    );
  }

  const registry = getRegistry();
  const children: SubHandle[] = [];
  let replyHandle: SubHandle | null = null;
  const replies = new Set<string>([eventId]);
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

  children.push(startThreadRootQuery(
    eventId,
    configuredRelayUrls,
    hintedRelayUrls,
    onEvent,
  ));

  refreshReplySubscription();

  return composeSubHandle(`thread:${eventId}`, children, () => replyHandle?.close());
};
