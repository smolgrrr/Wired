import type { Event } from "nostr-tools";
import { verifyPow } from "../../shared/pow/core.js";

export function eventWork(event: Event): number {
  return Math.pow(2, verifyPow(event));
}

export function replyWork(reply: Event): number {
  return Math.pow(2, reply.id.startsWith("0") ? verifyPow(reply) : 0);
}

export function totalWork(event: Event, replies: Event[]): number {
  return eventWork(event) + replies.reduce((sum, reply) => sum + replyWork(reply), 0);
}

export function replyEquivalentDifficulty(replies: Event[]): number {
  const sum = replies.reduce((acc, reply) => {
    const difficulty = verifyPow(reply);
    return difficulty > 0 ? acc + Math.pow(2, difficulty) : acc;
  }, 0);

  return sum > 0 ? Math.log2(sum) : 0;
}