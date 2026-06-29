import { useState, useEffect } from "react";
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
  const [unsignedPoWEvent, setUnsignedPoWEvent] = useState<UnsignedEvent>();
  const [signedPoWEvent, setSignedPoWEvent] = useState<Event>();

  const numCores = navigator.hardwareConcurrency || 4;
  const { startWork, messageFromWorker, hashrate, bestPow } = usePowMining(numCores, unsignedWithPubkey, difficulty);
  const doingWorkProp = submitStatus === "mining" || submitStatus === "publishing";

  useEffect(() => {
    if (!unsignedPoWEvent) return;

    let cancelled = false;

    const publishMinedEvent = async () => {
      setSubmitStatus("publishing");
      setSubmitError(null);

      try {
        const signedEvent = finalizeEvent(unsignedPoWEvent, sk);
        const accepted = await publish(signedEvent);
        if (cancelled) return;

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
        if (cancelled) return;
        setSubmitStatus("failed");
        setSubmitError("Publishing failed. Your draft was not posted.");
        setSignedPoWEvent(undefined);
        setAcceptedRelays([]);
      } finally {
        if (!cancelled) {
          setUnsignedPoWEvent(undefined);
        }
      }
    };

    void publishMinedEvent();

    return () => {
      cancelled = true;
    };
  }, [appendKey, sk, unsignedPoWEvent]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitStatus("mining");
    setSubmitError(null);
    setAcceptedRelays([]);
    setSignedPoWEvent(undefined);
    startWork();
  };

  useEffect(() => {
    if (messageFromWorker) {
      setUnsignedPoWEvent(messageFromWorker);
    }
  }, [messageFromWorker]);

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
