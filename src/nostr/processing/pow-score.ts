import type { Event } from "nostr-tools";
import { verifyPow } from "../../shared/pow/core.js";

export type WorkScoreOptions = {
  minReplyDifficulty?: number;
};

export type WorkScoreBreakdown = {
  rootWork: number;
  replyWork: number;
  totalWork: number;
  rankingReplyCount: number;
};

export function eventWork(event: Event): number {
  return Math.pow(2, verifyPow(event));
}

export function replyWork(reply: Event, options: WorkScoreOptions = {}): number {
  const difficulty = verifyPow(reply);
  const minDifficulty = options.minReplyDifficulty ?? 0;

  if (difficulty < minDifficulty) {
    return 0;
  }

  return Math.pow(2, difficulty);
}

export function workScoreBreakdown(
  event: Event,
  replies: Event[],
  options: WorkScoreOptions = {},
): WorkScoreBreakdown {
  const rootWork = eventWork(event);
  let rankingReplyCount = 0;

  const replyTotal = replies.reduce((sum, reply) => {
    const work = replyWork(reply, options);
    if (work > 0) {
      rankingReplyCount += 1;
    }
    return sum + work;
  }, 0);

  return {
    rootWork,
    replyWork: replyTotal,
    totalWork: rootWork + replyTotal,
    rankingReplyCount,
  };
}

export function totalWork(
  event: Event,
  replies: Event[],
  options: WorkScoreOptions = {},
): number {
  return workScoreBreakdown(event, replies, options).totalWork;
}

export function replyEquivalentDifficulty(replies: Event[]): number {
  const sum = replies.reduce((acc, reply) => {
    const difficulty = verifyPow(reply);
    return difficulty > 0 ? acc + Math.pow(2, difficulty) : acc;
  }, 0);

  return sum > 0 ? Math.log2(sum) : 0;
}
