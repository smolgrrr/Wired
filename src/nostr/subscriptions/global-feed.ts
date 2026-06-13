import type { Event } from "nostr-tools";
import { parseRepost } from "../processing/repost";
import type { SubscriptionRegistry } from "../subscription-registry";
import type { SubCallback, SubHandle } from "../types";

const POW_PREFIX_LEN = 4;

const trackRootNote = (notes: Set<string>, evt: Event) => {
  if (evt.kind === 1 && !evt.tags.some((tag) => tag[0] === "e")) {
    notes.add(evt.id);
    return;
  }

  if (evt.kind === 6) {
    const reposted = parseRepost(evt);
    if (reposted?.kind === 1) {
      notes.add(reposted.id);
    }
  }
};

export const subGlobalFeed = (
  registry: SubscriptionRegistry,
  onEvent: SubCallback,
  ageHours: number,
): SubHandle => {
  const children: SubHandle[] = [];
  const notes = new Set<string>();
  const now = Math.floor(Date.now() / 1000);
  const since = now - ageHours * 60 * 60;

  children.push(
    registry.subscribe([
      {
        filter: {
          ids: ["0".repeat(POW_PREFIX_LEN)],
          kinds: [1, 6],
          since,
          limit: 500,
        },
        cb: (evt, relay) => {
          trackRootNote(notes, evt);
          onEvent(evt, relay);
        },
        closeOnEose: true,
      },
    ]),
  );

  const stagedTimer = setTimeout(() => {
    children.push(
      registry.subscribe([
        {
          filter: {
            kinds: [1068],
            since,
          },
          cb: onEvent,
          closeOnEose: true,
        },
      ]),
    );

    if (notes.size > 0) {
      children.push(
        registry.subscribe([
          {
            filter: {
              "#e": Array.from(notes),
              kinds: [1],
            },
            cb: onEvent,
            closeOnEose: true,
          },
        ]),
      );
      notes.clear();
    }
  }, 2000);

  return {
    id: `global-feed:${children[0]?.id ?? "pending"}`,
    close: () => {
      clearTimeout(stagedTimer);
      children.forEach((child) => child.close());
    },
  };
};