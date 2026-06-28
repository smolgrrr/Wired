import type { Event } from "nostr-tools";
import { isRootNote } from "@lib/noteEvents";
import { getRegistry } from "../client";
import type { SubCallback, SubHandle } from "../types";
import { composeSubHandle } from "./utils";
import { verifyPow } from "../../shared/pow/core";
import {
  buildReplyFilter,
  clampReplyDepth,
  sinceFromAgeHours,
} from "./query-limits";

type GlobalFeedOptions = {
  rootRelayUrls?: readonly string[];
  replyRelayUrls?: readonly string[];
  rootFilterDifficulty?: number;
  replyDepth?: number;
};

const trackRootNote = (notes: Set<string>, evt: Event) => {
  if (isRootNote(evt)) {
    notes.add(evt.id);
  }
};

const trackAcceptedRootNote = (
  notes: Set<string>,
  seenPubkeys: Set<string>,
  evt: Event,
  filterDifficulty: number,
) => {
  if (evt.kind !== 1 && evt.kind !== 1068) return;
  if (evt.kind === 1 && !isRootNote(evt)) return;
  if (seenPubkeys.has(evt.pubkey)) return;
  if (verifyPow(evt) < filterDifficulty) return;

  seenPubkeys.add(evt.pubkey);

  if (evt.kind === 1) {
    notes.add(evt.id);
  }
};

const subRepliesForParents = (
  parentIds: string[],
  onEvent: SubCallback,
  relayUrls: readonly string[] | undefined,
  depth: number,
  since: number,
  children: SubHandle[],
) => {
  if (parentIds.length === 0 || depth <= 0) return;

  const childReplyIds = new Set<string>();
  const filter = buildReplyFilter(parentIds, since);
  if (!filter) return;

  children.push(
    getRegistry().subscribe([
      {
        filter,
        relayUrls: relayUrls ? [...relayUrls] : undefined,
        cb: (evt, relay) => {
          childReplyIds.add(evt.id);
          onEvent(evt, relay);
        },
        closeOnEose: true,
        onEose: () => {
          subRepliesForParents(
            Array.from(childReplyIds),
            onEvent,
            relayUrls,
            depth - 1,
            since,
            children,
          );
        },
      },
    ]),
  );
};

export const subRepliesForRootIds = (
  rootIds: string[],
  onEvent: SubCallback,
  options: {
    relayUrls?: readonly string[];
    depth?: number;
    since?: number;
  } = {},
): SubHandle => {
  const children: SubHandle[] = [];
  subRepliesForParents(
    rootIds,
    onEvent,
    options.relayUrls,
    clampReplyDepth(options.depth ?? 1),
    options.since ?? sinceFromAgeHours(24),
    children,
  );

  return composeSubHandle("feed-replies", children);
};

export const subGlobalFeed = (
  onEvent: SubCallback,
  ageHours: number,
  options: GlobalFeedOptions = {},
): SubHandle => {
  const registry = getRegistry();
  const children: SubHandle[] = [];
  const notes = new Set<string>();
  const seenPubkeys = new Set<string>();
  const now = Math.floor(Date.now() / 1000);
  const since = sinceFromAgeHours(ageHours, now);
  const replyDepth = clampReplyDepth(options.replyDepth ?? 1);

  children.push(
    registry.subscribe([
      {
        filter: {
          kinds: [1, 1068],
          since,
          limit: 500,
        },
        relayUrls: options.rootRelayUrls
          ? [...options.rootRelayUrls]
          : undefined,
        cb: (evt, relay) => {
          if (options.rootFilterDifficulty === undefined) {
            trackRootNote(notes, evt);
          } else {
            trackAcceptedRootNote(
              notes,
              seenPubkeys,
              evt,
              options.rootFilterDifficulty,
            );
          }
          onEvent(evt, relay);
        },
        closeOnEose: true,
        onEose: () => {
          if (notes.size === 0) return;

          const noteIds = Array.from(notes);
          notes.clear();

          subRepliesForParents(
            noteIds,
            onEvent,
            options.replyRelayUrls,
            replyDepth,
            since,
            children,
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
