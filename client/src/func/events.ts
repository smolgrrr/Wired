import {Event} from 'nostr-tools';
import {zeroLeadingBitsCount} from '../utils/crypto';

export const isEvent = <T>(evt?: T): evt is T => evt !== undefined;
export const isMention = ([tag, , , marker]: string[]) => tag === 'e' && marker === 'mention';
export const isPTag = ([tag]: string[]) => tag === 'p';
export const hasEventTag = (tag: string[]) => tag[0] === 'e';
export const isNotNonceTag = ([tag]: string[]) => tag !== 'nonce';

/**
 * validate proof-of-work of a nostr event per nip-13.
 * the validation always requires difficulty commitment in the nonce tag.
 *
 * @param {EventObj} evt event to validate
 * TODO: @param {number} targetDifficulty target proof-of-work difficulty
 */
export const validatePow = (evt: Event) => {
  const tag = evt.tags.find(tag => tag[0] === 'nonce');
  if (!tag) {
    return false;
  }
  const difficultyCommitment = Number(tag[2]);
  if (!difficultyCommitment || Number.isNaN(difficultyCommitment)) {
    return false;
  }
  return zeroLeadingBitsCount(evt.id) >= difficultyCommitment;
}

export const sortByCreatedAt = (evt1: Event, evt2: Event) => {
  if (evt1.created_at ===  evt2.created_at) {
    // console.log('TODO: OMG exactly at the same time, figure out how to sort then', evt1, evt2);
  }
  return evt1.created_at > evt2.created_at ? -1 : 1;
};

export const sortEventCreatedAt = (created_at: number) => (
  {created_at: a}: Event,
  {created_at: b}: Event,
) => (
  Math.abs(a - created_at) < Math.abs(b - created_at) ? -1 : 1
);

const isReply = ([tag, , , marker]: string[]) => tag === 'e' && marker !== 'mention';

/**
 * find reply-to ID according to nip-10, find marked reply or root tag or
 * fallback to positional (last) e tag or return null
 * @param {event} evt
 * @returns replyToID | null
 */
export const getReplyTo = (evt: Event): string | null => {
  const eventTags = evt.tags.filter(isReply);
  const withReplyMarker = eventTags.filter(([, , , marker]) => marker === 'reply');
  if (withReplyMarker.length === 1) {
    return withReplyMarker[0][1];
  }
  const withRootMarker = eventTags.filter(([, , , marker]) => marker === 'root');
  if (withReplyMarker.length === 0 && withRootMarker.length === 1) {
    return withRootMarker[0][1];
  }
  // fallback to deprecated positional 'e' tags (nip-10)
  const lastTag = eventTags.at(-1);
  return lastTag ? lastTag[1] : null;
};
