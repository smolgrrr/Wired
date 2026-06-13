import type { SubscriptionRegistry } from "../subscription-registry";
import type { SubCallback, SubHandle } from "../types";

export const subNotifications = (
  registry: SubscriptionRegistry,
  pubkeys: string[],
  onEvent: SubCallback,
): SubHandle => {
  if (pubkeys.length === 0) {
    return { id: "notifications:empty", close: () => {} };
  }

  const children: SubHandle[] = [];

  children.push(
    registry.subscribe([
      {
        filter: {
          authors: pubkeys,
          kinds: [1, 7],
          limit: 25,
        },
        cb: onEvent,
        closeOnEose: true,
      },
    ]),
  );

  children.push(
    registry.subscribe([
      {
        filter: {
          "#p": pubkeys,
          kinds: [1],
          limit: 50,
        },
        cb: onEvent,
        closeOnEose: true,
      },
    ]),
  );

  return {
    id: `notifications:${children.map((child) => child.id).join("+")}`,
    close: () => {
      children.forEach((child) => child.close());
    },
  };
};