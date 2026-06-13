import type { Filter, Subscription } from "nostr-tools";
import type { RelayPool } from "./relay-pool";
import type { SubCallback, SubHandle } from "./types";

type SubscribeRequest = {
  filter: Filter;
  cb: SubCallback;
  closeOnEose?: boolean;
};

export class SubscriptionRegistry {
  private readonly active = new Map<string, Subscription[]>();
  private nextId = 0;

  constructor(private readonly pool: RelayPool) {}

  subscribe(requests: SubscribeRequest[]): SubHandle {
    const id = String(++this.nextId);
    const subscriptions: Subscription[] = [];

    for (const { filter, cb, closeOnEose } of requests) {
      subscriptions.push(...this.pool.subscribe(filter, cb, closeOnEose));
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