import { type UnsignedEvent, type Event, getEventHash } from "nostr-tools";
import { getPow } from "../shared/pow/core";

const ctx: Worker = self as unknown as Worker;

ctx.addEventListener("message", (event) => {
  const { unsigned, difficulty, nonceStart, nonceStep } = event.data;
  const result = minePow(unsigned, difficulty, nonceStart, nonceStep);
  ctx.postMessage(result);
});

function minePow(
  unsigned: UnsignedEvent,
  difficulty: number,
  nonceStart: number,
  nonceStep: number,
): { found: boolean; event?: Omit<Event, "sig">; status?: string; currentNonce?: number; bestPoW?: number } {
  let nonce = nonceStart;
  let bestPoW = 0;

  const event = unsigned as Omit<Event, "sig">;
  const tag = ["nonce", nonce.toString(), difficulty.toString()];
  event.tags.push(tag);

  while (true) {
    tag[1] = nonce.toString();
    event.id = getEventHash(event);
    const leadingZeroes = getPow(event.id);

    if (leadingZeroes > bestPoW) {
      bestPoW = leadingZeroes;
    }

    if (leadingZeroes >= difficulty) {
      return { found: true, event };
    }

    nonce += nonceStep;

    if (nonce % (nonceStep * 10000) === 0) {
      ctx.postMessage({ status: "progress", currentNonce: nonce, bestPoW });
    }
  }
}

export default ctx;