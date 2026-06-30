import type { Event } from "nostr-tools";
import { isRootNote } from "../shared/lib/noteEvents.js";
import { verifyPow } from "../shared/pow/core.js";

export type FeedCandidateDecision = {
  accepted: boolean;
  replyRootId: string | null;
};

export function feedReplyRootId(event: Event): string | null {
  return event.kind === 1 && isRootNote(event) ? event.id : null;
}

export function createFeedCandidateTracker(filterDifficulty = 0) {
  const seenPubkeys = new Set<string>();

  return {
    check(event: Event): FeedCandidateDecision {
      if (event.kind !== 1 && event.kind !== 1068) {
        return { accepted: false, replyRootId: null };
      }

      const replyRootId = feedReplyRootId(event);
      if (event.kind === 1 && !replyRootId) {
        return { accepted: false, replyRootId: null };
      }

      if (seenPubkeys.has(event.pubkey)) {
        return { accepted: false, replyRootId: null };
      }

      if (verifyPow(event) < filterDifficulty) {
        return { accepted: false, replyRootId: null };
      }

      seenPubkeys.add(event.pubkey);
      return { accepted: true, replyRootId };
    },
  };
}
