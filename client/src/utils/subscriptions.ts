import {sub, subOnce, unsubAll} from './relays';
import { Event } from 'nostr-tools';
import { getPow } from './mine';

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
    const replies = new Set<string>();
    const prefix = Math.floor(16 / 4); //  4 bits in each '0' character
    sub({ // get past events
      cb: (evt, relay) => {
        pubkeys.add(evt.pubkey);
        notes.add(evt.id);
        onEvent(evt, relay);
      },
      filter: {
        ...(prefix && {ids: ['0'.repeat(prefix)]}),
        kinds: [1],
        since: Math.floor((Date.now() * 0.001) - (24 * 60 * 60)),
        limit: 100,
      },
      unsub: true
    });
  
    // // New Callback to only add events that pass the PoW requirement
    // const powFilteredCallback = (evt: Event, relay: string) => {
    //     if (getPow(evt.id) > 2) { // Replace '5' with your actual PoW requirement
    //     pubkeys.add(evt.pubkey);
    //     notes.add(evt.id);
    //     onEvent(evt, relay);
    //     }
    // };

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
        ...(prefix && {ids: ['0'.repeat(prefix)]}),
        kinds: [1],
        since: now,
      },
    });
  };

/** subscribe to global feed */
export const simpleSub24hFeed = (onEvent: SubCallback) => {
  unsubAll();
  sub({
    cb: onEvent,
    filter: {
      kinds: [1],
      //until: Math.floor(Date.now() * 0.001),
      since: Math.floor((Date.now() * 0.001) - (24 * 60 * 60)),
      limit: 1,
    }
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
        kinds: [1],
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
        kinds: [1],
      },
      unsub: true, // TODO: probably keep this subscription also after onReply/unsubAll
    });
  }, 200);
};