import { useState } from "react";
import type { UnsignedEvent } from "nostr-tools";

export function usePowMining(numCores: number, unsigned: UnsignedEvent, difficulty: string) {
  const [messageFromWorker, setMessageFromWorker] = useState<UnsignedEvent | null>(null);
  const [hashrate, setHashrate] = useState(0);
  const [bestPow, setBestPow] = useState(0);

  const startWork = () => {
    setMessageFromWorker(null);
    setHashrate(0);
    setBestPow(0);

    const startTime = Date.now();
    const workers = Array(numCores)
      .fill(null)
      .map(() => new Worker(new URL("../../workers/powWorker.ts", import.meta.url), { type: "module" }));

    workers.forEach((worker, index) => {
      worker.onmessage = (event) => {
        if (event.data.status === "progress") {
          setHashrate(Math.floor(event.data.currentNonce / ((Date.now() - startTime) / 1000)));
          setBestPow((current) => Math.max(current, event.data.bestPoW));
        } else if (event.data.found) {
          setMessageFromWorker(event.data.event);
          workers.forEach((w) => w.terminate());
        }
      };

      worker.postMessage({
        unsigned,
        difficulty,
        nonceStart: index,
        nonceStep: numCores,
      });
    });
  };

  return { startWork, messageFromWorker, hashrate, bestPow };
}
