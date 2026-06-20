import type { Event } from "nostr-tools";
import { isRootNote } from "@lib/noteEvents";
import { getRegistry } from "../client";
import { parseRepost } from "../processing/repost";
import type { SubCallback, SubHandle } from "../types";
import { composeSubHandle } from "./utils";

const trackRootNote = (notes: Set<string>, evt: Event) => {
  if (isRootNote(evt)) {
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

export const subGlobalFeed = (onEvent: SubCallback, ageHours: number): SubHandle => {
  const registry = getRegistry();
  const children: SubHandle[] = [];
  const notes = new Set<string>();
  const now = Math.floor(Date.now() / 1000);
  const since = now - ageHours * 60 * 60;

  children.push(
    registry.subscribe([
      {
        filter: {
          kinds: [1, 6, 1068],
          since,
          limit: 500,
        },
        cb: (evt, relay) => {
          trackRootNote(notes, evt);
          onEvent(evt, relay);
        },
        closeOnEose: true,
        onEose: () => {
          if (notes.size === 0) return;

          const noteIds = Array.from(notes);
          notes.clear();

          children.push(
            registry.subscribe([
              {
                filter: {
                  "#e": noteIds,
                  kinds: [1],
                },
                cb: onEvent,
                closeOnEose: true,
              },
            ]),
          );
        },
      },
    ]),
  );

  return composeSubHandle(
    `global-feed:${children[0]?.id ?? "pending"}`,
    children,
  );
};