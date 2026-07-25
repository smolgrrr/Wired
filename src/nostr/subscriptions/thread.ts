import type { Filter } from "nostr-tools";
import { COMPLETE_THREAD_TRAVERSAL_ENABLED } from "../../config";
import { getRegistry, startFiniteQuery, THREAD_RELAYS } from "../client";
import {
  DEFAULT_BROWSER_QUERY_DEADLINE_MS,
  type QueryCompletion,
} from "../browser-relay-access";
import type { SubCallback, SubHandle } from "../types";
import { composeSubHandle, finiteQuerySubHandle } from "./utils";
import {
  buildThreadReplyFilter,
  MAX_REPLY_PARENT_IDS,
} from "./query-limits";
import { uniqueRelays } from "@lib/threadRefs";

type ThreadSubscriptionOptions = {
  configuredRelayUrls?: readonly string[];
  hintedRelayUrls?: readonly string[];
  completeTraversal?: boolean;
  onTraversalComplete?: (completion: ThreadTraversalCompletion) => void;
};

export const MAX_THREAD_REPLY_PASSES = 60;

export type ThreadTraversalCompletion =
  | { state: "complete"; reason: "fixpoint-eose" }
  | {
    state: "incomplete";
    reason:
      | "deadline"
      | "cancelled"
      | "connect-failed"
      | "relay-closed"
      | "pass-bound";
  };

function queryCompletionResult(
  completion: QueryCompletion,
): ThreadTraversalCompletion {
  if (completion.reason === "deadline") {
    return { state: "incomplete", reason: "deadline" };
  }
  if (completion.reason === "cancelled") {
    return { state: "incomplete", reason: "cancelled" };
  }
  const incompleteTarget = completion.targets.find((target) =>
    target.state !== "eose"
  );
  if (!incompleteTarget) {
    return { state: "complete", reason: "fixpoint-eose" };
  }
  if (incompleteTarget.state === "connect-failed") {
    return { state: "incomplete", reason: "connect-failed" };
  }
  if (incompleteTarget.state === "cancelled") {
    return { state: "incomplete", reason: "cancelled" };
  }
  return {
    state: "incomplete",
    reason: incompleteTarget.state === "timed-out" ? "deadline" : "relay-closed",
  };
}

class ThreadTraversalCompletionCoordinator {
  private rootComplete = false;
  private repliesComplete = false;
  private reported = false;

  constructor(
    private readonly onComplete?: (completion: ThreadTraversalCompletion) => void,
  ) {}

  completeRoot(completion: QueryCompletion): void {
    const result = queryCompletionResult(completion);
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

function completeReplyFilters(parentIds: readonly string[]): Filter[] {
  const normalized = [...new Set(parentIds.map((id) => id.toLowerCase()))];
  const filters: Filter[] = [];
  for (let index = 0; index < normalized.length; index += MAX_REPLY_PARENT_IDS) {
    filters.push({
      "#e": normalized.slice(index, index + MAX_REPLY_PARENT_IDS),
      kinds: [1],
    });
  }
  return filters;
}

type TraversalPassState =
  | { state: "collecting"; discovered: boolean }
  | { state: "replacing"; discovered: boolean }
  | { state: "fixpoint" };

type TraversalCoverageState =
  | { state: "unconfirmed"; initialComplete: boolean }
  | { state: "confirmed" };

class CompleteThreadTraversal {
  private readonly knownIds: Set<string>;
  private current: SubHandle | null = null;
  private successor: SubHandle | null = null;
  private deadline: ReturnType<typeof setTimeout> | undefined;
  private lifecycle: "running" | "closed" = "running";
  private completion: "pending" | "reported" = "pending";
  private coverage: TraversalCoverageState = {
    state: "unconfirmed",
    initialComplete: false,
  };
  private passState: TraversalPassState = {
    state: "collecting",
    discovered: false,
  };
  private pass = 1;

  constructor(
    rootId: string,
    private readonly relayUrls: readonly string[],
    private readonly onEvent: SubCallback,
    private readonly onComplete?: (completion: ThreadTraversalCompletion) => void,
  ) {
    this.knownIds = new Set([rootId.toLowerCase()]);
  }

  start(): void {
    this.deadline = setTimeout(() => {
      this.report({ state: "incomplete", reason: "deadline" });
    }, DEFAULT_BROWSER_QUERY_DEADLINE_MS);
    this.current = this.openCoverage(
      () => this.settleCurrentPass(),
      (coverage) => {
        this.coverage = {
          state: "unconfirmed",
          initialComplete:
            coverage.requested > 0 && coverage.connected === coverage.requested,
        };
      },
    );
  }

  get handle(): SubHandle {
    return {
      id: "thread-complete-replies",
      close: () => this.close(),
    };
  }

  private openCoverage(
    onEose: () => void,
    onCoverage?: (coverage: { requested: number; connected: number }) => void,
  ): SubHandle {
    return getRegistry().subscribe([{
      filters: completeReplyFilters([...this.knownIds]),
      relayUrls: this.relayUrls,
      cb: (event, relayUrl) => this.accept(event, relayUrl),
      onEose,
      onCoverage,
      deduplicateEventIds: true,
      onRelayClose: () => {
        this.report({ state: "incomplete", reason: "relay-closed" });
      },
    }]);
  }

  confirmCoverage(): void {
    if (this.lifecycle === "closed" || this.coverage.state === "confirmed") {
      return;
    }
    const needsRecovery = !this.coverage.initialComplete;
    this.coverage = { state: "confirmed" };
    if (!needsRecovery) {
      if (this.passState.state === "fixpoint") this.reportComplete();
      return;
    }
    if (this.passState.state === "replacing") {
      this.passState = { state: "replacing", discovered: true };
    } else {
      this.startSuccessor();
    }
  }

  private accept(event: Parameters<SubCallback>[0], relayUrl: string): void {
    if (this.lifecycle === "closed") return;
    const eventId = event.id.toLowerCase();
    if (this.knownIds.has(eventId)) return;
    this.knownIds.add(eventId);
    this.onEvent(event, relayUrl);
    if (this.passState.state === "fixpoint") {
      this.startSuccessor();
    } else {
      this.passState = {
        state: this.passState.state,
        discovered: true,
      };
    }
  }

  private settleCurrentPass(): void {
    if (
      this.lifecycle === "closed" ||
      this.passState.state !== "collecting"
    ) {
      return;
    }
    if (this.passState.discovered) {
      this.startSuccessor();
      return;
    }
    this.passState = { state: "fixpoint" };
    this.reportComplete();
  }

  private startSuccessor(): void {
    if (
      this.lifecycle === "closed" ||
      this.passState.state === "replacing" ||
      !this.current
    ) {
      return;
    }
    this.pass += 1;
    if (this.pass > MAX_THREAD_REPLY_PASSES) {
      this.report({ state: "incomplete", reason: "pass-bound" });
    }
    this.passState = { state: "replacing", discovered: false };
    const previous = this.current;
    const next = this.openCoverage(() => {
      if (this.lifecycle === "closed" || this.successor !== next) return;
      const discovered = this.passState.state === "replacing" &&
        this.passState.discovered;
      previous.close();
      this.current = next;
      this.successor = null;
      if (discovered) {
        this.passState = { state: "collecting", discovered: true };
        this.startSuccessor();
      } else {
        this.passState = { state: "fixpoint" };
        this.reportComplete();
      }
    });
    this.successor = next;
  }

  private reportComplete(): void {
    if (this.coverage.state !== "confirmed") return;
    this.report({ state: "complete", reason: "fixpoint-eose" });
  }

  private report(completion: ThreadTraversalCompletion): void {
    if (this.completion === "reported") return;
    this.completion = "reported";
    if (this.deadline) {
      clearTimeout(this.deadline);
      this.deadline = undefined;
    }
    this.onComplete?.(completion);
  }

  private close(): void {
    if (this.lifecycle === "closed") return;
    if (this.completion === "pending") {
      this.report({ state: "incomplete", reason: "cancelled" });
    }
    this.lifecycle = "closed";
    this.successor?.close();
    this.current?.close();
    this.successor = null;
    this.current = null;
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
  const replies = new CompleteThreadTraversal(
    eventId,
    relayUrls,
    deliver,
    (result) => completion.completeReplies(result),
  );
  replies.start();
  children.push(replies.handle);

  children.push(startThreadRootQuery(
    eventId,
    configuredRelayUrls,
    hintedRelayUrls,
    deliver,
    (result) => {
      if (queryCompletionResult(result).state === "complete") {
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
