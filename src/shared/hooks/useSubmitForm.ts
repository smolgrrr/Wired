import { useEffect, useRef, useState, type FormEvent } from "react";
import { generateSecretKey, getPublicKey, finalizeEvent, type UnsignedEvent, type Event } from "nostr-tools";
import { publish } from "../../nostr/client";
import { bytesToHex } from "@noble/hashes/utils";
import { useStoredKeys } from "./useStoredKeys";
import { usePowMining } from "./usePowMining";

export type SubmitStatus = "idle" | "mining" | "publishing" | "published" | "failed";

export const useSubmitForm = (unsigned: UnsignedEvent, difficulty: string) => {
  const { appendKey } = useStoredKeys();
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [acceptedRelays, setAcceptedRelays] = useState<string[]>([]);
  const [sk, setSk] = useState(generateSecretKey());
  const unsignedWithPubkey = { ...unsigned, pubkey: getPublicKey(sk) };
  const [signedPoWEvent, setSignedPoWEvent] = useState<Event>();
  const activeSubmitId = useRef(0);

  const numCores = navigator.hardwareConcurrency || 4;
  const { startWork, hashrate, bestPow } = usePowMining(numCores, unsignedWithPubkey, difficulty);
  const doingWorkProp = submitStatus === "mining" || submitStatus === "publishing";

  useEffect(() => {
    return () => {
      activeSubmitId.current += 1;
    };
  }, []);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const submitId = activeSubmitId.current + 1;
    activeSubmitId.current = submitId;
    setSubmitStatus("mining");
    setSubmitError(null);
    setAcceptedRelays([]);
    setSignedPoWEvent(undefined);

    startWork({
      onMined: async (minedEvent) => {
        if (activeSubmitId.current !== submitId) return;

        setSubmitStatus("publishing");
        setSubmitError(null);

        try {
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
  };
};
