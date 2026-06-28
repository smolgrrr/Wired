import type { Event } from "nostr-tools";
import { verifyPow } from "../shared/pow/core.js";
import { isRootNote } from "../shared/lib/noteEvents.js";
import { workScoreBreakdown } from "./processing/pow-score.js";
import type { ProcessedEvent } from "./types.js";

export type { ProcessedEvent } from "./types.js";

export function compareProcessedEventsByWork(
  a: ProcessedEvent,
  b: ProcessedEvent,
): number {
  return b.totalWork - a.totalWork || b.postEvent.created_at - a.postEvent.created_at;
}

export function buildRepliesByParent(events: Event[]): Map<string, Event[]> {
  const repliesByParent = new Map<string, Event[]>();

  events.forEach((event) => {
    if (event.kind !== 1) return;
    event.tags.forEach((tag) => {
      if (tag[0] !== "e" || !tag[1]) return;
      const replies = repliesByParent.get(tag[1]) ?? [];
      replies.push(event);
      repliesByParent.set(tag[1], replies);
    });
  });

  return repliesByParent;
}

export function collectThreadReplies(
  rootId: string,
  repliesByParent: Map<string, Event[]>,
): Event[] {
  const replies: Event[] = [];
  const seen = new Set<string>();
  const pending = [...(repliesByParent.get(rootId) ?? [])];

  while (pending.length > 0) {
    const reply = pending.shift();
    if (!reply || seen.has(reply.id)) continue;

    seen.add(reply.id);
    replies.push(reply);
    pending.push(...(repliesByParent.get(reply.id) ?? []));
  }

  return replies;
}

export function toProcessedEvents(
  posts: Event[],
  replySource: Event[],
): ProcessedEvent[] {
  const repliesByParent = buildRepliesByParent(replySource);

  return posts
    .map((postEvent) => {
      const replies = repliesByParent.get(postEvent.id) ?? [];
      return {
        postEvent,
        replies,
        threadReplyCount: replies.length,
        ...workScoreBreakdown(postEvent, replies),
      };
    })
    .sort((a, b) => a.postEvent.created_at - b.postEvent.created_at);
}

export const processFeedEvents = (events: Event[], filterDifficulty = 0): ProcessedEvent[] => {
  const repliesByParent = buildRepliesByParent(events);
  const seenPubkeys = new Set<string>();
  const posts: Event[] = [];

  events.forEach((event) => {
    if (event.kind !== 1 && event.kind !== 1068) return;
    if (seenPubkeys.has(event.pubkey)) return;
    if (event.kind === 1 && !isRootNote(event)) return;
    if (verifyPow(event) < filterDifficulty) return;

    seenPubkeys.add(event.pubkey);
    posts.push(event);
  });

  return posts
    .map((postEvent) => {
      const replies = collectThreadReplies(postEvent.id, repliesByParent);
      return {
        postEvent,
        replies,
        threadReplyCount: replies.length,
        ...workScoreBreakdown(postEvent, replies, {
          minReplyDifficulty: filterDifficulty,
        }),
      };
    })
    .sort(compareProcessedEventsByWork);
};
