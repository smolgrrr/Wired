import { Event, Filter, Relay, Subscription } from "nostr-tools";
import type { SubCallback } from "./types";

export type SubscribeOptions = {
  closeOnEose?: boolean;
  relayUrls?: string[];
  onEose?: () => void;
};

export class RelayPool {
  private readonly relays = new Map<string, Relay>();
  private defaultRelayUrls = new Set<string>();

  get connectedUrls(): string[] {
    return [...this.relays.keys()];
  }

  get isConnected(): boolean {
    return this.defaultRelayUrls.size > 0;
  }

  async connect(urls: readonly string[]): Promise<void> {
    this.defaultRelayUrls = new Set(urls);
    await this.ensureConnected(urls);
  }

  async ensureConnected(urls: readonly string[]): Promise<void> {
    const toConnect = urls.filter((url) => !this.relays.has(url));
    await Promise.allSettled(toConnect.map((url) => this.connectRelay(url)));
  }

  private async connectRelay(url: string): Promise<void> {
    try {
      const relay = await Relay.connect(url);
      this.relays.set(url, relay);
    } catch {
      // Relay unavailable; other relays may still connect.
    }
  }

  subscribe(filter: Filter, cb: SubCallback, options: SubscribeOptions = {}): Subscription[] {
    const { closeOnEose = false, relayUrls, onEose } = options;
    const targetUrls = relayUrls ?? [...this.defaultRelayUrls];
    const subscriptions: Subscription[] = [];
    const connectedUrls = targetUrls.filter((url) => this.relays.has(url));
    let eoseCount = 0;

    const handleEose = (sub: Subscription) => {
      eoseCount += 1;
      if (eoseCount >= connectedUrls.length) {
        onEose?.();
      }
      if (closeOnEose) {
        sub.close();
      }
    };

    for (const url of connectedUrls) {
      const relay = this.relays.get(url);
      if (!relay) continue;

      const sub = relay.subscribe([filter], {
        onevent(event) {
          cb(event, relay.url);
        },
      });

      if (closeOnEose || onEose) {
        sub.oneose = () => handleEose(sub);
      }

      subscriptions.push(sub);
    }

    if ((closeOnEose || onEose) && connectedUrls.length === 0) {
      onEose?.();
    }

    return subscriptions;
  }

  async publish(event: Event): Promise<Set<string>> {
    const accepted = new Set<string>();

    await Promise.allSettled(
      [...this.defaultRelayUrls].map(async (url) => {
        const relay = this.relays.get(url);
        if (!relay) return;
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