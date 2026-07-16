import { Event, Filter, Relay, Subscription } from "nostr-tools";
import type { SubCallback } from "./types";

const RELAY_CONNECT_TIMEOUT_MS = 4_000;

export type SubscribeOptions = {
  closeOnEose?: boolean;
  relayUrls?: readonly string[];
  onEose?: () => void;
};

export class RelayPool {
  private readonly relays = new Map<string, Relay>();
  private readonly subscriptionsByRelay = new Map<string, Set<Subscription>>();
  private defaultRelayUrls = new Set<string>();
  private readonly inFlightPublishes = new Map<string, Promise<Set<string>>>();

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
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      const relay = await Promise.race([
        Relay.connect(url),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("Relay connection timed out")),
            RELAY_CONNECT_TIMEOUT_MS,
          );
        }),
      ]);
      this.relays.set(url, relay);
      relay.onclose = () => {
        if (this.relays.get(url) !== relay) return;
        this.relays.delete(url);
        // A terminal relay cannot deliver more events. Count its open subscriptions
        // as EOSE so aggregate traversals can continue immediately and their
        // library EOSE timers are cleared.
        const subscriptions = this.subscriptionsByRelay.get(url) ?? [];
        this.subscriptionsByRelay.delete(url);
        [...subscriptions].forEach((subscription) => {
          subscription.receivedEose();
        });
      };
    } catch {
      // Relay unavailable; other relays may still connect.
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  subscribe(filter: Filter, cb: SubCallback, options: SubscribeOptions = {}): Subscription[] {
    const { closeOnEose = false, relayUrls, onEose } = options;
    const targetUrls = relayUrls ?? [...this.defaultRelayUrls];
    const subscriptions: Subscription[] = [];
    const connectedUrls = targetUrls.filter((url) => this.relays.get(url)?.connected);
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
        onclose: () => {
          const tracked = this.subscriptionsByRelay.get(url);
          tracked?.delete(sub);
          if (tracked?.size === 0) {
            this.subscriptionsByRelay.delete(url);
          }
        },
      });

      const tracked = this.subscriptionsByRelay.get(url) ?? new Set<Subscription>();
      tracked.add(sub);
      this.subscriptionsByRelay.set(url, tracked);

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

  publish(event: Event): Promise<Set<string>> {
    const existing = this.inFlightPublishes.get(event.id);
    if (existing) return existing;

    const publish = this.publishToRelays(event).finally(() => {
      if (this.inFlightPublishes.get(event.id) === publish) {
        this.inFlightPublishes.delete(event.id);
      }
    });
    this.inFlightPublishes.set(event.id, publish);
    return publish;
  }

  private async publishToRelays(event: Event): Promise<Set<string>> {
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
