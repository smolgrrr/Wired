import type { Filter, Subscription } from "nostr-tools";
import type { RelayPool, SubscribeOptions } from "./relay-pool";
import type { SubCallback, SubHandle } from "./types";

type SubscribeRequest = SubscribeOptions & {
  cb: SubCallback;
} & (
  | { filter: Filter; filters?: never }
  | { filter?: never; filters: Filter[] }
);

export class SubscriptionRegistry {
  private readonly active = new Map<string, Subscription[]>();
  private nextId = 0;

  constructor(private readonly pool: RelayPool) {}

  subscribe(requests: SubscribeRequest[]): SubHandle {
    const id = String(++this.nextId);
    const subscriptions: Subscription[] = [];

    for (const request of requests) {
      const filters = request.filters ?? [request.filter];
      subscriptions.push(
        ...this.pool.subscribe(filters, request.cb, request),
      );
    }

    this.active.set(id, subscriptions);

    return {
      id,
      close: () => {
        const subs = this.active.get(id);
        if (!subs) return;
        subs.forEach((sub) => sub.close());
        this.active.delete(id);
      },
    };
  }

  closeAll(): void {
    for (const subs of this.active.values()) {
      subs.forEach((sub) => sub.close());
    }
    this.active.clear();
  }
}
