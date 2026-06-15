import type { Event } from "nostr-tools";
import { DEFAULT_DIFFICULTY } from "../../config";
import { isRootNote } from "@lib/noteEvents";
import { verifyPow } from "../../shared/pow/core";
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

export const subGlobalFeed = (
  onEvent: SubCallback,
  ageHours: number,
  filterDifficulty = DEFAULT_DIFFICULTY,
): SubHandle => {
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
          if (verifyPow(evt) < filterDifficulty) return;
          trackRootNote(notes, evt);
          onEvent(evt, relay);
        },
        closeOnEose: true,
      },
    ]),
  );

  const stagedTimer = setTimeout(() => {
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

  return composeSubHandle(
    `global-feed:${children[0]?.id ?? "pending"}`,
    children,
    () => clearTimeout(stagedTimer),
  );
};