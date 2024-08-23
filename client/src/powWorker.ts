import { type UnsignedEvent, type Event, getEventHash } from 'nostr-tools'

// eslint-disable-next-line no-restricted-globals
const ctx: Worker = self as any;

// Respond to message from parent thread
ctx.addEventListener('message', (event) => {
    console.log("Received message in worker:", event.data);
    
    const { unsigned, difficulty, nonceStart, nonceStep } = event.data;
    
    const result = minePow(unsigned, difficulty, nonceStart, nonceStep);
    console.log("Mining result:", result);
    
    // Post the mined event back to the main thread
    ctx.postMessage(result);
});

ctx.onerror = function(e) {
    console.error("Worker error:", e);
};

/** Get POW difficulty from a Nostr hex ID. */
export function getPow(hex: string): number {
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
export function minePow<K extends number>(unsigned: UnsignedEvent, difficulty: number, nonceStart: number, nonceStep: number): { found: boolean, event?: Omit<Event, 'sig'> } {
    let nonce = nonceStart;
    let bestPoW = 0;
    
    const event = unsigned as Omit<Event, 'sig'>
    const tag = ['nonce', nonce.toString(), difficulty.toString()]

    event.tags.push(tag);

    // We use a while loop that might run indefinitely until a solution is found.
    // Consider adding a breaking condition if you want to limit the number of nonces each worker checks.
    while (true) {
        tag[1] = (nonce).toString();

        event.id = getEventHash(event);
        let leadingZeroes = getPow(event.id);

        if (leadingZeroes > bestPoW) {
            bestPoW = leadingZeroes;
        }

        if (leadingZeroes >= difficulty) {
            return { found: true, event: event };
        }

        nonce += nonceStep;

        if (nonce % (nonceStep * 10000) === 0) {
            ctx.postMessage({ status: 'progress', currentNonce: nonce,  bestPoW});
        }
    }
    return { found: false };
}

export default ctx;
