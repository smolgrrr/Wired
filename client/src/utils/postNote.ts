import {
  type Event as NostrEvent,
  generatePrivateKey,
  getEventHash,
  getPublicKey,
  signEvent,
} from "nostr-tools";

export const handleThreadSubmit = async (comment: string, tags: []) => {
  if (!comment) {
    alert("no message provided");
    return;
  }

  const newEvent: NostrEvent = {
    id: 'null',
    content: comment,
    kind: 1,
    tags,
    created_at: Math.floor(Date.now() / 1000),
    pubkey: 'null',
    sig: 'null',
  };

  let sk = generatePrivateKey();

  newEvent.pubkey = getPublicKey(sk);
  newEvent.id = getEventHash(newEvent);
  newEvent.sig = signEvent(newEvent, sk);

  return newEvent
};