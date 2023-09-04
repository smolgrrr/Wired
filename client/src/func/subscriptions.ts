import {Event} from 'nostr-tools';
import {getReplyTo, hasEventTag, isMention, isPTag} from './events';
import {config} from './settings';
import {sub, subOnce, unsubAll} from './relays';

type SubCallback = (
  event: Event,
  relay: string,
) => void;

/** subscribe to global feed */
export const subGlobalFeed = (onEvent: SubCallback) => {
  console.info('subscribe to global feed');
  unsubAll();
  const now = Math.floor(Date.now() * 0.001);
  const pubkeys = new Set<string>();
  const notes = new Set<string>();
  const prefix = Math.floor(config.filterDifficulty / 4); //  4 bits in each '0' character
  sub({ // get past events
    cb: (evt, relay) => {
      pubkeys.add(evt.pubkey);
      notes.add(evt.id);
      onEvent(evt, relay);
    },
    filter: {
      ...(prefix && {ids: ['0'.repeat(prefix)]}),
      kinds: [1],
      until: now,
      ...(!prefix && {since: Math.floor(now - (24 * 60 * 60))}),
      limit: 100,
    },
    unsub: true
  });

  setTimeout(() => {
    // get profile info
    sub({
      cb: onEvent,
      filter: {
        authors: Array.from(pubkeys),
        kinds: [0],
        limit: pubkeys.size,
      },
      unsub: true,
    });
    pubkeys.clear();

    notes.clear();
  }, 2000);

  // subscribe to future notes, reactions and profile updates
  sub({
    cb: (evt, relay) => {
      onEvent(evt, relay);
      if (
        evt.kind !== 1
        || pubkeys.has(evt.pubkey)
      ) {
        return;
      }
    },
    filter: {
      ...(prefix && {ids: ['0'.repeat(prefix)]}),
      kinds: [1],
      since: now,
    },
  });
};

/** subscribe to a note id (nip-19) */
export const subNote = (
  eventId: string,
  onEvent: SubCallback,
) => {
  unsubAll();
  sub({
    cb: onEvent,
    filter: {
      ids: [eventId],
      kinds: [1],
      limit: 1,
    },
    unsub: true,
  });

  const replies = new Set<string>();

  const onReply = (evt: Event, relay: string) => {
    replies.add(evt.id)
    onEvent(evt, relay);
    unsubAll();
    sub({
      cb: onEvent,
      filter: {
        '#e': Array.from(replies),
        kinds: [1, 7],
      },
      unsub: true,
    });
  };

  replies.add(eventId);
  setTimeout(() => {
    sub({
      cb: onReply,
      filter: {
        '#e': [eventId],
        kinds: [1, 7],
      },
      unsub: true, // TODO: probably keep this subscription also after onReply/unsubAll
    });
  }, 200);
};

export const subEventID = (
  id: string,
  onEvent: SubCallback,
) => {
  unsubAll();
  sub({
    cb: onEvent,
    filter: {
      ids: [id],
      limit: 1,
    },
    unsub: true,
  });
  sub({
    cb: onEvent,
    filter: {
      authors: [id],
      limit: 200,
    },
    unsub: true,
  });
};
