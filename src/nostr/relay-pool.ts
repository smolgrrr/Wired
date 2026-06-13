import { Event, Filter, Relay, Subscription } from "nostr-tools";
import type { SubCallback } from "./types";

export class RelayPool {
  private readonly relays = new Map<string, Relay>();

  get connectedUrls(): string[] {
    return [...this.relays.keys()];
  }

  get isConnected(): boolean {
    return this.relays.size > 0;
  }

  async connect(urls: readonly string[]): Promise<void> {
    await Promise.allSettled(urls.map((url) => this.connectRelay(url)));
  }

  private async connectRelay(url: string): Promise<void> {
    try {
      const relay = await Relay.connect(url);
      this.relays.set(url, relay);
    } catch {
      // Relay unavailable; other relays may still connect.
    }
  }

  subscribe(filter: Filter, cb: SubCallback, closeOnEose = false): Subscription[] {
    const subscriptions: Subscription[] = [];

    this.relays.forEach((relay) => {
      const sub = relay.subscribe([filter], {
        onevent(event) {
          cb(event, relay.url);
        },
      });

      if (closeOnEose) {
        sub.oneose = () => {
          sub.close();
        };
      }

      subscriptions.push(sub);
    });

    return subscriptions;
  }

  async publish(event: Event): Promise<Set<string>> {
    const accepted = new Set<string>();

    await Promise.allSettled(
      [...this.relays.entries()].map(async ([url, relay]) => {
        try {
          await relay.publish(event);
          accepted.add(url);
        } catch {
          // Relay rejected or failed the publish.
        }
      }),
    );

    return accepted;
  }
}