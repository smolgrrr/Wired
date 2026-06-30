import { type UnsignedEvent, type Event, getEventHash } from "nostr-tools";
import { getPow } from "../shared/pow/core";

export type MinedPowEvent = UnsignedEvent & Pick<Event, "id">;

export type PowWorkerRequest = {
  type: "mine";
  unsigned: UnsignedEvent;
  difficulty: number;
  nonceStart: number;
  nonceStep: number;
};

export type PowWorkerResponse =
  | {
      type: "progress";
      currentNonce: number;
      bestPow: number;
    }
  | {
      type: "found";
      event: MinedPowEvent;
    };

const ctx = self as DedicatedWorkerGlobalScope;

ctx.addEventListener("message", (event: MessageEvent<PowWorkerRequest>) => {
  if (event.data.type !== "mine") return;

  const { unsigned, difficulty, nonceStart, nonceStep } = event.data;
  const result = minePow(unsigned, difficulty, nonceStart, nonceStep);
  ctx.postMessage(result);
});

function minePow(unsigned: UnsignedEvent, difficulty: number, nonceStart: number, nonceStep: number): PowWorkerResponse {
  let nonce = nonceStart;
  let bestPoW = 0;

  const event: MinedPowEvent = { ...unsigned, tags: [...unsigned.tags], id: "" };
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
      return { type: "found", event };
    }

    nonce += nonceStep;

    if (nonce % (nonceStep * 10000) === 0) {
      ctx.postMessage({ type: "progress", currentNonce: nonce, bestPow: bestPoW } satisfies PowWorkerResponse);
    }
  }
}

export default ctx;
