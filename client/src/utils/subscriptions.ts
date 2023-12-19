import { sub, subOnce, unsubAll } from './relays';
import { Event } from 'nostr-tools';

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
  const prefix = Math.floor(16 / 4); //  4 bits in each '0' character
  sub({ // get past events
    cb: (evt, relay) => {
      pubkeys.add(evt.pubkey);
      notes.add(evt.id);
      onEvent(evt, relay);
    },
    filter: {
      ...(prefix && { ids: ['0'.repeat(prefix)] }),
      kinds: [1, 6],
      since: Math.floor((Date.now() * 0.001) - (24 * 60 * 60)),
      limit: 500,
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

    sub({
      cb: onEvent,
      filter: {
        '#e': Array.from(notes),
        kinds: [1],
      },
      unsub: true,
    });

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
      subOnce({ // get profile data
        relay,
        cb: onEvent,
        filter: {
          authors: [evt.pubkey],
          kinds: [0],
          limit: 1,
        }
      });
    },
    filter: {
      ...(prefix && { ids: ['0'.repeat(prefix)] }),
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
  const pubkeys = new Set<string>();
  sub({
    cb: (evt, relay) => {
      pubkeys.add(evt.pubkey);
      onEvent(evt, relay);
    },
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
      cb: (evt, relay) => {
        pubkeys.add(evt.pubkey);
        onEvent(evt, relay);
      },
      filter: {
        '#e': Array.from(replies),
        kinds: [1],
      },
      unsub: true,
    });
  };

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
  }, 2000);

  replies.add(eventId);
  // subscribe to future replies
  sub({
    cb: onReply,
    filter: {
      '#e': [eventId],
      kinds: [1],
    },
  });
};

/** quick subscribe to a note id (nip-19) */
export const subNoteOnce = (
  eventId: string,
  onEvent: SubCallback,
) => {
  const pubkeys = new Set<string>();
  sub({
    cb: (evt, relay) => {
      pubkeys.add(evt.pubkey);
      onEvent(evt, relay);
    },
    filter: {
      ids: [eventId],
      kinds: [1],
      limit: 1,
    },
    unsub: true,
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
  }, 2000);
};

/** quick subscribe to a note id (nip-19) */
export const subNotesOnce = (
  eventIds: string[],
  onEvent: SubCallback,
) => {
  const pubkeys = new Set<string>();
  sub({
    cb: (evt, relay) => {
      pubkeys.add(evt.pubkey);
      onEvent(evt, relay);
    },
    filter: {
      ids: eventIds,
      kinds: [1],
      limit: 1,
    },
    unsub: true,
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
  }, 2000);
};  

// /** quick subscribe to a note id (nip-19) */
// export const subNotifications = (
//   pubkeys: string[],
//   onEvent: SubCallback,
// ) => {
//   const replyPubkeys = new Set<string>();
//   sub({
//     cb: (evt, relay) => {
//       replyPubkeys.add(evt.pubkey);
//       onEvent(evt, relay);
//     },
//     filter: {
//       "#p": pubkeys,
//       kinds: [1],
//       limit: 50,
//     },
//     unsub: true,
//   });

//   setTimeout(() => {
//     // get profile info
//     sub({
//       cb: onEvent,
//       filter: {
//         authors: Array.from(replyPubkeys),
//         kinds: [0],
//         limit: replyPubkeys.size,
//       },
//       unsub: true,
//     });
//     replyPubkeys.clear();
//   }, 2000);
// };  

const hasEventTag = (tag: string[]) => tag[0] === 'e';
const isReply = ([tag, , , marker]: string[]) => tag === 'e' && marker !== 'mention';

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

export const subNotifications = (
  pubkeys: string[],
  onEvent: SubCallback,
) => {
  unsubAll();

  sub({
    cb: (evt, relay) => {
      onEvent(evt, relay);
    },
    filter: {
      authors: pubkeys,
      kinds: [1, 7],
      limit: 25,
    },
    unsub: true,
  });

  sub({
    cb: (evt, relay) => {
      onEvent(evt, relay);
    },
    filter: {
      '#p': pubkeys,
      kinds: [1],
      limit: 50,
    },
    unsub: true,
  });
};
