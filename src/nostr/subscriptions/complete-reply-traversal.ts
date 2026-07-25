import type { Filter } from "nostr-tools";
import { getRegistry } from "../client";
import {
  DEFAULT_BROWSER_QUERY_DEADLINE_MS,
  type QueryCompletion,
} from "../browser-relay-access";
import type { SubCallback, SubHandle } from "../types";
import { MAX_REPLY_PARENT_IDS } from "./query-limits";

export const MAX_REPLY_TRAVERSAL_PASSES = 60;

export type ReplyTraversalCompletion =
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

export function queryCompletionToReplyTraversal(
  completion: QueryCompletion,
): ReplyTraversalCompletion {
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

type TraversalPassState =
  | { state: "collecting"; discovered: boolean }
  | { state: "replacing"; discovered: boolean }
  | { state: "fixpoint" };

type TraversalCoverageState =
  | { state: "unconfirmed"; initialComplete: boolean }
  | { state: "confirmed" };

type CompleteReplyTraversalOptions = {
  initialParentIds: readonly string[];
  relayUrls: readonly string[];
  onEvent: SubCallback;
  onComplete?: (completion: ReplyTraversalCompletion) => void;
  since?: number;
};

function completeReplyFilters(
  parentIds: readonly string[],
  since: number | undefined,
): Filter[] {
  const normalized = [...new Set(parentIds.map((id) => id.toLowerCase()))];
  const filters: Filter[] = [];
  for (let index = 0; index < normalized.length; index += MAX_REPLY_PARENT_IDS) {
    filters.push({
      "#e": normalized.slice(index, index + MAX_REPLY_PARENT_IDS),
      kinds: [1],
      ...(since === undefined ? {} : { since }),
    });
  }
  return filters;
}

export class CompleteReplyTraversal {
  private readonly knownIds: Set<string>;
  private readonly relayUrls: readonly string[];
  private readonly onEvent: SubCallback;
  private readonly onComplete?: (completion: ReplyTraversalCompletion) => void;
  private readonly since?: number;
  private current: SubHandle | null = null;
  private successor: SubHandle | null = null;
  private deadline: ReturnType<typeof setTimeout> | undefined;
  private lifecycle: "idle" | "running" | "closed" = "idle";
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

  constructor(options: CompleteReplyTraversalOptions) {
    this.relayUrls = options.relayUrls;
    this.onEvent = options.onEvent;
    this.onComplete = options.onComplete;
    this.since = options.since;
    this.knownIds = new Set(
      options.initialParentIds.map((parentId) => parentId.toLowerCase()),
    );
    this.startIfNeeded();
  }

  private startIfNeeded(): void {
    if (this.lifecycle !== "idle" || this.knownIds.size === 0) return;
    this.lifecycle = "running";
    this.deadline = setTimeout(() => {
      this.report({ state: "incomplete", reason: "deadline" });
    }, DEFAULT_BROWSER_QUERY_DEADLINE_MS);
    this.current = this.openCoverage(() => this.settleCurrentPass());
  }

  get handle(): SubHandle {
    return {
      id: "complete-replies",
      close: () => this.close(),
    };
  }

  addParentIds(parentIds: readonly string[]): void {
    let added = false;
    parentIds.forEach((parentId) => {
      const normalized = parentId.toLowerCase();
      if (this.knownIds.has(normalized)) return;
      this.knownIds.add(normalized);
      added = true;
    });
    if (!added) return;
    if (this.lifecycle === "idle") {
      this.startIfNeeded();
      return;
    }
    if (this.lifecycle === "closed") return;
    this.markDiscovered();
  }

  confirmCoverage(): void {
    if (this.lifecycle === "closed" || this.coverage.state === "confirmed") {
      return;
    }
    const needsRecovery = !this.coverage.initialComplete;
    this.coverage = { state: "confirmed" };
    if (this.lifecycle === "idle") {
      this.reportComplete();
      return;
    }
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

  reportIncomplete(
    reason: Extract<ReplyTraversalCompletion, { state: "incomplete" }>["reason"],
  ): void {
    this.report({ state: "incomplete", reason });
  }

  private openCoverage(onEose: () => void): SubHandle {
    return getRegistry().subscribe([{
      filters: completeReplyFilters([...this.knownIds], this.since),
      relayUrls: this.relayUrls,
      cb: (event, relayUrl) => this.accept(event, relayUrl),
      onEose,
      onCoverage: (coverage) => {
        this.recordCoverage(coverage);
      },
      deduplicateEventIds: true,
      onRelayClose: () => {
        this.report({ state: "incomplete", reason: "relay-closed" });
      },
    }]);
  }

  private recordCoverage(
    coverage: { requested: number; connected: number },
  ): void {
    const complete =
      coverage.requested > 0 && coverage.connected === coverage.requested;
    if (this.coverage.state === "confirmed") {
      if (!complete) this.reportIncomplete("connect-failed");
      return;
    }
    this.coverage = { state: "unconfirmed", initialComplete: complete };
  }

  private accept(event: Parameters<SubCallback>[0], relayUrl: string): void {
    if (this.lifecycle === "closed") return;
    const eventId = event.id.toLowerCase();
    if (this.knownIds.has(eventId)) return;
    this.knownIds.add(eventId);
    this.onEvent(event, relayUrl);
    this.markDiscovered();
  }

  private markDiscovered(): void {
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
      this.lifecycle !== "running" ||
      this.passState.state === "replacing" ||
      !this.current
    ) {
      return;
    }
    this.pass += 1;
    if (this.pass > MAX_REPLY_TRAVERSAL_PASSES) {
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

  private report(completion: ReplyTraversalCompletion): void {
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
