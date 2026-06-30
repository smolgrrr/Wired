import { useCallback, useEffect, useRef, useState } from "react";
import type { UnsignedEvent } from "nostr-tools";
import type { MinedPowEvent, PowWorkerRequest, PowWorkerResponse } from "../../workers/powWorker";

type StartWorkOptions = {
  onMined: (event: MinedPowEvent) => void;
  onError?: () => void;
};

export function usePowMining(numCores: number, unsigned: UnsignedEvent, difficulty: string) {
  const [messageFromWorker, setMessageFromWorker] = useState<MinedPowEvent | null>(null);
  const [hashrate, setHashrate] = useState(0);
  const [bestPow, setBestPow] = useState(0);
  const activeJobId = useRef(0);
  const workers = useRef<Worker[]>([]);

  const cancelWork = useCallback(() => {
    activeJobId.current += 1;
    workers.current.forEach((worker) => worker.terminate());
    workers.current = [];
  }, []);

  useEffect(() => cancelWork, [cancelWork]);

  const startWork = useCallback((options?: StartWorkOptions) => {
    cancelWork();
    setMessageFromWorker(null);
    setHashrate(0);
    setBestPow(0);

    const jobId = activeJobId.current;
    const parsedDifficulty = Number.parseInt(difficulty, 10);
    const startTime = Date.now();
    const nextWorkers = Array(numCores)
      .fill(null)
      .map(() => new Worker(new URL("../../workers/powWorker.ts", import.meta.url), { type: "module" }));

    workers.current = nextWorkers;

    const finishJob = () => {
      if (activeJobId.current !== jobId) return false;

      workers.current.forEach((worker) => worker.terminate());
      workers.current = [];
      activeJobId.current += 1;

      return true;
    };

    nextWorkers.forEach((worker, index) => {
      worker.onmessage = (event: MessageEvent<PowWorkerResponse>) => {
        if (activeJobId.current !== jobId) return;

        const response = event.data;

        if (response.type === "progress") {
          const elapsedSeconds = (Date.now() - startTime) / 1000;
          setHashrate(Math.floor(response.currentNonce / (elapsedSeconds || 1)));
          setBestPow((currentBestPow) => Math.max(currentBestPow, response.bestPow));
          return;
        }

        if (finishJob()) {
          setMessageFromWorker(response.event);
          options?.onMined(response.event);
        }
      };

      worker.onerror = () => {
        if (finishJob()) {
          options?.onError?.();
        }
      };

      const request: PowWorkerRequest = {
        type: "mine",
        unsigned,
        difficulty: parsedDifficulty,
        nonceStart: index,
        nonceStep: numCores,
      };

      worker.postMessage(request);
    });
  }, [cancelWork, difficulty, numCores, unsigned]);

  return { startWork, cancelWork, messageFromWorker, hashrate, bestPow };
}
