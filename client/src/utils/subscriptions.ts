import { sub, subOnce, unsubAll } from './relays';
import { Event } from 'nostr-tools';

type SubCallback = (
  event: Event,
  relay: string,
) => void;

/** subscribe to global feed */
export const subGlobalFeed = (onEvent: SubCallback, age: number) => {
  console.info('subscribe to global feed');
  unsubAll();
  const now = Math.floor(Date.now() * 0.001);
  const pubkeys = new Set<string>();
  const notes = new Set<string>();
  const prefix = 4; //  4 bits in each '0' character
  sub({ // get past events
    cb: (evt, relay) => {
      if (evt.kind === 1 && !evt.tags.some(tag => tag[0] === 'e')) {
        pubkeys.add(evt.pubkey);
        notes.add(evt.id);
      } else if (evt.kind === 6) {
        const parsedEvt = JSON.parse(evt.content);
        if (parsedEvt.kind === 1) {
          pubkeys.add(parsedEvt.pubkey);
          notes.add(parsedEvt.id);
        }
      }
      onEvent(evt, relay);
    },
    filter: {
      ...(prefix && { ids: ['0'.repeat(prefix)] }),
      kinds: [1, 6],
      since: Math.floor(now - (age * 60 * 60)),
      limit: 500,
    },
    unsub: true
  });

  setTimeout(() => {
    sub({
      cb: onEvent,
      filter: {
        kinds: [1068],
        since: Math.floor(now - (age * 60 * 60)),
      },
      unsub: true,
    });

    // get profile info
    if (pubkeys.size > 0) {
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
    }

    if (notes.size > 0) {
      sub({
        cb: onEvent,
        filter: {
          '#e': Array.from(notes),
          kinds: [1],
        },
        unsub: true,
      });
      notes.clear();
    }
  }, 2000);
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
      kinds: [1, 1068],
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
    if (pubkeys.size > 0) {
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
    }
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
    if (pubkeys.size > 0) {
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
    }
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
    if (pubkeys.size > 0) {
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
    }
  }, 2000);
};  

/** quick subscribe to a note id (nip-19) */
export const subPoll = (
  eventId: string,
  onEvent: SubCallback,
) => {
  sub({
    cb: (evt, relay) => {
      onEvent(evt, relay);
    },
    filter: {
      '#e': [eventId],
      kinds: [1018],
    },
    unsub: true,
  });
};

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

export const subProfile = (
  pubkey: string,
  onEvent: SubCallback,
) => {
  unsubAll();

  sub({
    cb: (evt, relay) => {
      onEvent(evt, relay);
    },
    filter: {
      authors: [pubkey],
      kinds: [1, 7],
      limit: 25,
    },
    unsub: true,
  });
};

/** subscribe to global feed */
export const subHashtagFeed = (
  hashtag: string,
  onEvent: SubCallback,
  age: number
  ) => {
    console.info('subscribe to hashtag feed');
    unsubAll();
    const now = Math.floor(Date.now() * 0.001);
    const pubkeys = new Set<string>();
    const notes = new Set<string>();
    sub({ // get past events
      cb: (evt, relay) => {
        if (!evt.tags.some(tag => tag[0] === 'e')) {
          pubkeys.add(evt.pubkey);
          notes.add(evt.id);
        }
        onEvent(evt, relay);
      },
      filter: {
        "#t": [hashtag],
        kinds: [1],
        since: Math.floor(now - (24 * 60 * 60)),
        limit: 20,
      },
      unsub: true
    });

    const prefix = 4; //  4 bits in each '0' character
    sub({ // get past events
      cb: (evt, relay) => {
        if (evt.kind === 1 && !evt.tags.some(tag => tag[0] === 'e')) {
          pubkeys.add(evt.pubkey);
          notes.add(evt.id);
        } else if (evt.kind === 6) {
          const parsedEvt = JSON.parse(evt.content);
          if (parsedEvt.kind === 1) {
            pubkeys.add(parsedEvt.pubkey);
            notes.add(parsedEvt.id);
          }
        }
        onEvent(evt, relay);
      },
      filter: {
        ...(prefix && { ids: ['0'.repeat(prefix)] }),
        "#t": [hashtag],
        kinds: [1, 6],
        since: Math.floor((Date.now() * 0.001) - (age * 60 * 60)),
        limit: 50,
      },
      unsub: true
    });
  
    setTimeout(() => {
      // get profile info
      if (pubkeys.size > 0) {
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
      }
  
      if (notes.size > 0) {
        sub({
          cb: onEvent,
          filter: {
            '#e': Array.from(notes),
            kinds: [1],
          },
          unsub: true,
        });
        notes.clear();
      }
    }, 2000);
};