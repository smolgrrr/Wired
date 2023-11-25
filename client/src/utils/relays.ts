import {Event, Filter, relayInit, Relay, Sub} from 'nostr-tools';

type SubCallback = (
  event: Readonly<Event>,
  relay: Readonly<string>,
) => void;

type Subscribe = {
  cb: SubCallback;
  filter: Filter;
  unsub?: boolean;
};

const subList: Array<Sub> = [];
const currentSubList: Array<Subscribe> = [];
const relayMap = new Map<string, Relay>();

export const addRelay = async (url: string) => {
  const relay = relayInit(url);
  relay.on('connect', () => {
    console.info(`connected to ${relay.url}`);
  });
  relay.on('error', () => {
    console.warn(`failed to connect to ${relay.url}`);
  });
  try {
    await relay.connect();
    currentSubList.forEach(({cb, filter}) => subscribe(cb, filter, relay));
    relayMap.set(url, relay);
  } catch {
    console.warn(`could not connect to ${url}`);
  }
};

export const unsubscribe = (sub: Sub) => {
  sub.unsub();
  subList.splice(subList.indexOf(sub), 1);
};

const subscribe = (
  cb: SubCallback,
  filter: Filter,
  relay: Relay,
  unsub?: boolean
) => {
  const sub = relay.sub([filter]);
  subList.push(sub);
  sub.on('event', (event: Event) => {
    cb(event, relay.url);
  });
  if (unsub) {
    sub.on('eose', () => {
      // console.log('eose', relay.url);
      unsubscribe(sub);
    });
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
    sub.on('eose', () => {
      // console.log('eose', obj.relay);
      unsubscribe(sub);
    });
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