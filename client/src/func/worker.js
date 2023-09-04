import {getEventHash} from 'nostr-tools';
import {zeroLeadingBitsCount} from './utils/crypto';

const mine = (event, difficulty, timeout = 5) => {
  const max = 256; // arbitrary
  if (!Number.isInteger(difficulty) || difficulty < 0 || difficulty > max) {
    throw new Error(`difficulty must be an integer between 0 and ${max}`);
  }
  // continue with mining
  let n = BigInt(0);
  event.tags.unshift(['nonce', n.toString(), `${difficulty}`]);

  const until = Math.floor(Date.now() * 0.001) + timeout;
  console.time('pow');
  while (true) {
    const now = Math.floor(Date.now() * 0.001);
    if (timeout !== 0 && (now > until)) {
      console.timeEnd('pow');
      throw 'timeout';
    }
    if (now !== event.created_at) {
      event.created_at = now;
      // n = BigInt(0); // could reset nonce as we have a new timestamp
    }
    event.tags[0][1] = (++n).toString();
    const id = getEventHash(event);
    if (zeroLeadingBitsCount(id) === difficulty) {
      console.timeEnd('pow');
      return {id, ...event};
    }
  }
};

addEventListener('message', (msg) => {
  const {difficulty, event, timeout} = msg.data;
  try {
    const minedEvent = mine(event, difficulty, timeout);
    postMessage({event: minedEvent});
  } catch (err) {
    postMessage({error: err});
  }
});