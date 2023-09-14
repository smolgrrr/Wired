import {Event, nip19} from 'nostr-tools';
import {zeroLeadingBitsCount} from './utils/crypto';
import {elem} from './utils/dom';
import {bounce} from './utils/time';
import {isWssUrl} from './utils/url';
import {closeSettingsView, config, toggleSettingsView} from './settings';
import {subGlobalFeed, subEventID, subNote} from './subscriptions'
import {getReplyTo, hasEventTag, isEvent, isMention, sortByCreatedAt, sortEventCreatedAt} from './events';
import {clearView, getViewContent, getViewElem, getViewOptions, setViewElem, view} from './view';
import {EventWithNip19, EventWithNip19AndReplyTo, textNoteList, replyList} from './notes';
import {createContact, createTextNote, renderEventDetails, renderRecommendServer, renderUpdateContact} from './ui';

// curl -H 'accept: application/nostr+json' https://relay.nostr.ch/

type EventRelayMap = {
  [eventId: string]: string[];
};
const eventRelayMap: EventRelayMap = {}; // eventId: [relay1, relay2]

const renderNote = (
  evt: EventWithNip19,
  i: number,
  sortedFeeds: EventWithNip19[],
) => {
  if (getViewElem(evt.id)) { // note already in view
    return;
  }
  const article = createTextNote(evt, eventRelayMap[evt.id][0]);
  if (i === 0) {
    getViewContent().append(article);
  } else {
    getViewElem(sortedFeeds[i - 1].id).before(article);
  }
  setViewElem(evt.id, article);
};

const hasEnoughPOW = (
  [tag, , commitment]: string[],
  eventId: string
) => {
  return tag === 'nonce' && Number(commitment) >= config.filterDifficulty && zeroLeadingBitsCount(eventId) >= config.filterDifficulty;
};

const renderFeed = bounce(() => {
  const view = getViewOptions();
  switch (view.type) {
    case 'note':
      textNoteList
        .concat(replyList) // search id in notes and replies
        .filter(note => note.id === view.id)
        .forEach(renderNote);
      break;
    case 'feed':
      const now = Math.floor(Date.now() * 0.001);
      textNoteList
        .filter(note => {
          // dont render notes from the future
          if (note.created_at > now) return false;
          // if difficulty filter is configured dont render notes with too little pow
          return !config.filterDifficulty || note.tags.some(tag => hasEnoughPOW(tag, note.id))
        })
        .sort(sortByCreatedAt)
        .reverse()
        .forEach(renderNote);
      break;
  }
}, 17); // (16.666 rounded, an arbitrary value to limit updates to max 60x per s)

const renderReply = (evt: EventWithNip19AndReplyTo) => {
  const parent = getViewElem(evt.replyTo);
  if (!parent || getViewElem(evt.id)) {
    return;
  }
  let replyContainer = parent.querySelector('.mbox-replies');
  if (!replyContainer) {
    replyContainer = elem('div', {className: 'mbox-replies'});
    parent.append(replyContainer);
    parent.classList.add('mbox-has-replies');
  }
  const reply = createTextNote(evt, eventRelayMap[evt.id][0]);
  replyContainer.append(reply);
  setViewElem(evt.id, reply);
};

const handleReply = (evt: EventWithNip19, relay: string) => {
  if (
    getViewElem(evt.id) // already rendered probably received from another relay
    || evt.tags.some(isMention) // ignore mentions for now
  ) {
    return;
  }
  const replyTo = getReplyTo(evt);
  if (!replyTo) {
    return;
  }
  const evtWithReplyTo = {replyTo, ...evt};
  replyList.push(evtWithReplyTo);
  renderReply(evtWithReplyTo);
};

const handleTextNote = (evt: Event, relay: string) => {
  if (evt.content.startsWith('vmess://') && !evt.content.includes(' ')) {
    console.info('drop VMESS encrypted message');
    return;
  }
  if (eventRelayMap[evt.id]) {
    eventRelayMap[evt.id] = [...(eventRelayMap[evt.id]), relay]; // TODO: remove eventRelayMap and just check for getViewElem?
  } else {
    eventRelayMap[evt.id] = [relay];
    const evtWithNip19 = {
      nip19: {
        note: nip19.noteEncode(evt.id),
        npub: nip19.npubEncode(evt.pubkey),
      },
      ...evt,
    };
    if (evt.tags.some(hasEventTag)) {
      handleReply(evtWithNip19, relay);
    } else {
      textNoteList.push(evtWithNip19);
    }
  }
  if (!getViewElem(evt.id)) {
    renderFeed();
  }
};

const rerenderFeed = () => {
  clearView();
  renderFeed();
};
config.rerenderFeed = rerenderFeed;

const onEvent = (evt: Event, relay: string) => {
  switch (evt.kind) {
    case 0:
      handleTextNote(evt, relay);
      break;
    default:
      // console.log(`TODO: add support for event kind ${evt.kind}`/*, evt*/)
  }
};

// subscribe and change view
const route = (path: string) => {
  if (path === '/') {
      subGlobalFeed(onEvent);
      view('/feed', {type: 'feed'});
    return;
  }
  if (path === '/feed') {
    subGlobalFeed(onEvent);
    view('/feed', {type: 'feed'});
  } else if (path.length === 64 && path.match(/^\/[0-9a-z]+$/)) {
    const {type, data} = nip19.decode(path.slice(1));
    if (typeof data !== 'string') {
      console.warn('nip19 ProfilePointer, EventPointer and AddressPointer are not yet supported');
      return;
    }
    switch(type) {
      case 'note':
        subNote(data, onEvent);
        view(path, {type: 'note', id: data});
        break;
      default:
        console.warn(`type ${type} not yet supported`);
    }
    renderFeed();
  } else if (path.length === 65) {
    const eventID = path.slice(1);
    subEventID(eventID, onEventDetails);
    view(path, {type: 'event', id: eventID});
  } else {
    console.warn('no support for ', path);
  }
};

// onload
route(location.pathname);

// only push a new entry if there is no history onload
if (!history.length) {
  history.pushState({}, '', location.pathname);
}

window.addEventListener('popstate', (event) => {
  route(location.pathname);
});
