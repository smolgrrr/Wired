import { getEventHash } from "nostr-tools";

// powWorker.ts
console.log("Worker script started");

self.addEventListener('message', function (e) {
    console.log("Received message in worker:", e.data);
    
    const { unsigned, difficulty } = e.data;
    
    const result = minePow(unsigned, difficulty);
    console.log("Mining result:", result);
    
    // Post the mined event back to the main thread
    self.postMessage(result);
}, false);

self.onerror = function(e) {
    console.error("Worker error:", e);
};

/** Get POW difficulty from a Nostr hex ID. */
export function getPow(hex) {
  let count = 0

  for (let i = 0; i < hex.length; i++) {
    const nibble = parseInt(hex[i], 16)
    if (nibble === 0) {
      count += 4
    } else {
      count += Math.clz32(nibble) - 28
      break
    }
  }

  return count
}

/**
 * Mine an event with the desired POW. This function mutates the event.
 * Note that this operation is synchronous and should be run in a worker context to avoid blocking the main thread.
 *
 * Adapted from Snort: https://git.v0l.io/Kieran/snort/src/commit/4df6c19248184218c4c03728d61e94dae5f2d90c/packages/system/src/pow-util.ts#L14-L36
 */
export function minePow(unsigned, difficulty) {
    let count = 0
  
    const event = unsigned;
    const tag = ['nonce', count.toString(), difficulty.toString()]
  
    event.tags.push(tag)
  
    while (true) {
      const now = Math.floor(new Date().getTime() / 1000)
  
      if (now !== event.created_at) {
        count = 0
        event.created_at = now
      }
  
      tag[1] = (++count).toString()
  
      event.id = getEventHash(event)
  
      if (getPow(event.id) >= difficulty) {
        break
      }
    }
  
    return event
  }