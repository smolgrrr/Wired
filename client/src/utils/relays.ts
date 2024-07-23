import {Event, Filter, Relay, Subscription} from 'nostr-tools';

type SubCallback = (
  event: Readonly<Event>,
  relay: Readonly<string>,
) => void;

type Subscribe = {
  cb: SubCallback;
  filter: Filter;
  unsub?: boolean;
};

const blacklistUrl = ["lain.la", "casualcrypto.date", "files.catbox.moe", "m.primal.net", "i.ibb.co"];

const subList: Array<Subscription> = [];
const currentSubList: Array<Subscribe> = [];
const relayMap = new Map<string, Relay>();

export const addRelay = async (url: string) => {
  const relay = await Relay.connect(url)
  console.log(`connected to ${relay.url}`)
  try {
    
    currentSubList.forEach(({cb, filter}) => subscribe(cb, filter, relay));
    relayMap.set(url, relay);
  } catch {
    console.warn(`could not connect to ${url}`);
  }
};

export const unsubscribe = (sub: Subscription) => {
  sub.close();
  subList.splice(subList.indexOf(sub), 1);
};

const subscribe = (
  cb: SubCallback,
  filter: Filter,
  relay: Relay,
  unsub?: boolean
) => {
  const sub = relay.subscribe([filter], {
    onevent(event) {
      if (!blacklistUrl.some(blacklistedUrl => event.content.includes(blacklistedUrl))) {
        cb(event, relay.url);
      }
    },
  });
  subList.push(sub);

  if (unsub) {
    if (typeof sub.oneose === 'function') {
      sub.oneose = () => {
        // console.log('eose', relay.url);
        unsubscribe(sub);
      };
    }
  }
  return sub;
};

export const sub = (obj: Subscribe) => {
  currentSubList.push(obj);
  relayMap.forEach((relay) => subscribe(obj.cb, obj.filter, relay, obj.unsub));
};

export const subOnce = (
  obj: Subscribe & {relay: string}
) => {
  const relay = relayMap.get(obj.relay);
  if (relay) {
    const sub = subscribe(obj.cb, obj.filter, relay);
    sub.oneose = () => {
      // console.log('eose', relay.url);
      unsubscribe(sub);
    };
  }
};

export const unsubAll = () => {
  subList.forEach(unsubscribe);
  currentSubList.length = 0;
};

export const publish = (event: Event) => {
    relayMap.forEach(async (relay, url) => {
      try {
        await relay.publish(event);
        console.info(`${relay.url} has accepted our event: ${event.id}`);
      } catch (reason) {
        console.error(`failed to publish to ${relay.url}: ${reason}`);
      }
    });
  };


addRelay('wss://relay.snort.social');
addRelay('wss://nostr.bitcoiner.social');
addRelay('wss://nostr.mom');
addRelay('wss://relay.nostr.bg');
addRelay('wss://nos.lol');
addRelay('wss://powrelay.xyz');
addRelay('wss://relay.damus.io');
addRelay('wss://nostr.mutinywallet.com');