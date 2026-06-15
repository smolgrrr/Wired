import type { Event } from "nostr-tools";
import { verifyPow } from "../shared/pow/core";
import { isRootNote } from "@lib/noteEvents";
import { parseRepost } from "./processing/repost";
import { totalWork } from "./processing/pow-score";
import type { ProcessedEvent } from "./types";

export type { ProcessedEvent } from "./types";
export { parseRepost } from "./processing/repost";

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

export function toProcessedEvents(
  posts: Event[],
  replySource: Event[],
): ProcessedEvent[] {
  const repliesByParent = buildRepliesByParent(replySource);

  return posts
    .map((postEvent) => {
      const replies = repliesByParent.get(postEvent.id) ?? [];
      return { postEvent, replies, totalWork: totalWork(postEvent, replies) };
    })
    .sort((a, b) => b.totalWork - a.totalWork || b.postEvent.created_at - a.postEvent.created_at);
}

export const processFeedEvents = (events: Event[], filterDifficulty = 0): ProcessedEvent[] => {
  const repliesByParent = buildRepliesByParent(events);
  const seenPubkeys = new Set<string>();
  const posts: Event[] = [];

  events.forEach((event) => {
    const displayedEvent = parseRepost(event);
    if (!displayedEvent || seenPubkeys.has(displayedEvent.pubkey)) return;
    if (event.kind === 1 && !isRootNote(event)) return;
    if (verifyPow(event) < filterDifficulty) return;

    seenPubkeys.add(displayedEvent.pubkey);
    posts.push(event);
  });

  return posts
    .map((postEvent) => {
      const replies = repliesByParent.get(parseRepost(postEvent)?.id ?? postEvent.id) ?? [];
      return { postEvent, replies, totalWork: totalWork(postEvent, replies) };
    })
    .sort((a, b) => b.totalWork - a.totalWork || b.postEvent.created_at - a.postEvent.created_at);
};