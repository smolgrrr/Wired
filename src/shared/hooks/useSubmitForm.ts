import { useEffect, useRef, useState, type FormEvent } from "react";
import { generateSecretKey, getPublicKey, finalizeEvent, type UnsignedEvent, type Event } from "nostr-tools";
import { publish } from "../../nostr/client";
import { bytesToHex } from "@noble/hashes/utils";
import { useStoredKeys } from "./useStoredKeys";
import { usePowMining } from "./usePowMining";
import {
  fetchWiredAccountStatus,
  submitWiredAccountPost,
  type WiredAccountStatus,
} from "../../features/wiredAccount/api";
import { timeToGoEst } from "@lib/timeEstimate";

export type SubmitStatus = "idle" | "mining" | "publishing" | "published" | "failed";

const POW_HASHRATE_STORAGE_KEY = "wired:last-pow-hashrate";
const FALLBACK_POW_HASHRATE = 50_000;

function readStoredHashrate(): number {
  if (typeof window === "undefined") return FALLBACK_POW_HASHRATE;

  const value = Number(window.localStorage.getItem(POW_HASHRATE_STORAGE_KEY));
  return Number.isFinite(value) && value > 0 ? value : FALLBACK_POW_HASHRATE;
}

function storeHashrate(value: number): void {
  if (typeof window === "undefined") return;
  if (!Number.isFinite(value) || value <= 0) return;

  window.localStorage.setItem(POW_HASHRATE_STORAGE_KEY, String(Math.floor(value)));
}

export function willUseWiredAccount(
  difficulty: string,
  status: WiredAccountStatus | null,
): boolean {
  const difficultyNumber = Number(difficulty);

  return (
    Boolean(status?.configured && status.pubkey) &&
    Number.isFinite(difficultyNumber) &&
    difficultyNumber >= Number(status?.minimumPow)
  );
}

export const useSubmitForm = (unsigned: UnsignedEvent, difficulty: string) => {
  const { appendKey } = useStoredKeys();
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [acceptedRelays, setAcceptedRelays] = useState<string[]>([]);
  const [sk, setSk] = useState(generateSecretKey());
  const unsignedWithPubkey = { ...unsigned, pubkey: getPublicKey(sk) };
  const [signedPoWEvent, setSignedPoWEvent] = useState<Event>();
  const [wiredAccountStatus, setWiredAccountStatus] = useState<WiredAccountStatus | null>(null);
  const [estimatedHashrate, setEstimatedHashrate] = useState(readStoredHashrate);
  const activeSubmitId = useRef(0);

  const numCores = navigator.hardwareConcurrency || 4;
  const { startWork, hashrate, bestPow } = usePowMining(numCores, unsignedWithPubkey, difficulty);
  const doingWorkProp = submitStatus === "mining" || submitStatus === "publishing";

  useEffect(() => {
    let cancelled = false;

    void fetchWiredAccountStatus()
      .then((status) => {
        if (!cancelled) setWiredAccountStatus(status);
      })
      .catch(() => {
        if (!cancelled) setWiredAccountStatus(null);
      });

    return () => {
      cancelled = true;
      activeSubmitId.current += 1;
    };
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const submitId = activeSubmitId.current + 1;
    activeSubmitId.current = submitId;
    const submitDifficulty = difficulty;
    setSubmitStatus("mining");
    setSubmitError(null);
    setAcceptedRelays([]);
    setSignedPoWEvent(undefined);

    const status = await fetchWiredAccountStatus({ force: true }).catch(() => wiredAccountStatus);
    if (activeSubmitId.current !== submitId) return;
    if (status && status !== wiredAccountStatus) {
      setWiredAccountStatus(status);
    }

    const shouldUseWiredAccount = willUseWiredAccount(submitDifficulty, status);
    const submitUnsigned = shouldUseWiredAccount && status?.pubkey
      ? { ...unsigned, pubkey: status.pubkey }
      : unsignedWithPubkey;

    startWork({
      unsigned: submitUnsigned,
      difficulty: submitDifficulty,
      onHashrate: (nextHashrate) => {
        storeHashrate(nextHashrate);
        setEstimatedHashrate(nextHashrate);
      },
      onMined: async (minedEvent) => {
        if (activeSubmitId.current !== submitId) return;

        setSubmitStatus("publishing");
        setSubmitError(null);

        try {
          if (shouldUseWiredAccount) {
            const result = await submitWiredAccountPost(minedEvent);
            if (activeSubmitId.current !== submitId) return;

            if (result.acceptedRelays.length === 0) {
              setSubmitStatus("failed");
              setSubmitError("No relay accepted the event. Your draft was not posted.");
              setSignedPoWEvent(undefined);
              setAcceptedRelays([]);
              return;
            }

            setAcceptedRelays(result.acceptedRelays);
            setSignedPoWEvent(result.event);
            setSubmitStatus("published");
            return;
          }

          const signedEvent = finalizeEvent(minedEvent, sk);
          const accepted = await publish(signedEvent);
          if (activeSubmitId.current !== submitId) return;

          if (accepted.size === 0) {
            setSubmitStatus("failed");
            setSubmitError("No relay accepted the event. Your draft was not posted.");
            setSignedPoWEvent(undefined);
            setAcceptedRelays([]);
            return;
          }

          setAcceptedRelays([...accepted]);
          setSignedPoWEvent(signedEvent);
          appendKey(bytesToHex(sk), getPublicKey(sk));
          setSk(generateSecretKey());
          setSubmitStatus("published");
        } catch {
          if (activeSubmitId.current !== submitId) return;

          setSubmitStatus("failed");
          setSubmitError("Publishing failed. Your draft was not posted.");
          setSignedPoWEvent(undefined);
          setAcceptedRelays([]);
        }
      },
      onError: () => {
        if (activeSubmitId.current !== submitId) return;

        setSubmitStatus("failed");
        setSubmitError("Mining failed. Your draft was not posted.");
        setSignedPoWEvent(undefined);
        setAcceptedRelays([]);
      },
    });
  };

  return {
    handleSubmit,
    doingWorkProp,
    submitStatus,
    submitError,
    acceptedRelays,
    hashrate,
    bestPow,
    signedPoWEvent,
    powEta: timeToGoEst(difficulty, hashrate || estimatedHashrate),
    willUseWiredAccount: willUseWiredAccount(difficulty, wiredAccountStatus),
  };
};
