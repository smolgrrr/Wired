import type { Event } from "nostr-tools";
import { DEFAULT_DIFFICULTY } from "../../config";
import { isRootNote } from "@lib/noteEvents";
import { hasNonceTag, verifyPow } from "../../shared/pow/core";
import { getRegistry } from "../client";
import { parseRepost } from "../processing/repost";
import type { SubCallback, SubHandle } from "../types";
import { composeSubHandle } from "./utils";

const FEED_LIMIT_PER_RELAY = 100;
const MAX_REPLY_ROOTS = 50;

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

function passesFeedFilter(event: Event, filterDifficulty: number): boolean {
  return hasNonceTag(event) && verifyPow(event) >= filterDifficulty;
}

function replyRootIds(notes: Set<string>): string[] {
  const ids = Array.from(notes);
  if (ids.length <= MAX_REPLY_ROOTS) return ids;
  return ids.slice(-MAX_REPLY_ROOTS);
}

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
          limit: FEED_LIMIT_PER_RELAY,
        },
        cb: (evt, relay) => {
          if (!passesFeedFilter(evt, filterDifficulty)) return;
          trackRootNote(notes, evt);
          onEvent(evt, relay);
        },
        closeOnEose: true,
      },
    ]),
  );

  const stagedTimer = setTimeout(() => {
    const rootIds = replyRootIds(notes);
    if (rootIds.length > 0) {
      children.push(
        registry.subscribe([
          {
            filter: {
              "#e": rootIds,
              kinds: [1],
            },
            cb: (evt, relay) => {
              if (!passesFeedFilter(evt, filterDifficulty)) return;
              onEvent(evt, relay);
            },
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