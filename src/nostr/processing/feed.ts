import type { Event } from "nostr-tools";
import { verifyPow } from "../../shared/pow/core";
import { parseRepost } from "./repost";
import { eventWork, replyWork } from "./pow-score";
import type { ProcessedEvent } from "../types";

export const processFeedEvents = (events: Event[], filterDifficulty = 0): ProcessedEvent[] => {
  const repliesByEvent = new Map<string, Event[]>();

  events.forEach((event) => {
    if (event.kind !== 1) return;
    event.tags.forEach((tag) => {
      if (tag[0] !== "e" || !tag[1]) return;
      const replies = repliesByEvent.get(tag[1]) ?? [];
      replies.push(event);
      repliesByEvent.set(tag[1], replies);
    });
  });

  const seenPubkeys = new Set<string>();
  const processed: ProcessedEvent[] = [];

  events.forEach((event) => {
    const displayedEvent = parseRepost(event);
    if (!displayedEvent || seenPubkeys.has(displayedEvent.pubkey)) return;
    if (event.kind === 1 && event.tags.some((tag) => tag[0] === "e")) return;
    if (verifyPow(event) < filterDifficulty) return;

    seenPubkeys.add(displayedEvent.pubkey);
    const replies = repliesByEvent.get(displayedEvent.id) ?? [];
    const totalWork = eventWork(event) + replies.reduce((sum, reply) => sum + replyWork(reply), 0);
    processed.push({ postEvent: event, replies, totalWork });
  });

  return processed.sort((a, b) => b.totalWork - a.totalWork || b.postEvent.created_at - a.postEvent.created_at);
};