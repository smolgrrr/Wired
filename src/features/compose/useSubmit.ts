import { useState, useEffect } from "react";
import { generateSecretKey, getPublicKey, finalizeEvent, UnsignedEvent, Event } from "nostr-tools";
import { publish } from "../../nostr/client";
import { bytesToHex } from "@noble/hashes/utils";
import { useSettings } from "../../app/settings";
import { useStoredKeys } from "../../shared/hooks/useStoredKeys";
import { usePowMining } from "./usePowMining";

export const useSubmitForm = (unsigned: UnsignedEvent, difficulty: string) => {
  const { settings } = useSettings();
  const { appendKey } = useStoredKeys();
  const [doingWorkProp, setDoingWorkProp] = useState(false);
  const [sk, setSk] = useState(generateSecretKey());
  const unsignedWithPubkey = { ...unsigned, pubkey: getPublicKey(sk) };
  const [unsignedPoWEvent, setUnsignedPoWEvent] = useState<UnsignedEvent>();
  const [signedPoWEvent, setSignedPoWEvent] = useState<Event>();

  const numCores = navigator.hardwareConcurrency || 4;
  const { startWork, messageFromWorker, hashrate, bestPow } = usePowMining(numCores, unsignedWithPubkey, difficulty);

  useEffect(() => {
    if (unsignedPoWEvent) {
      setDoingWorkProp(false);
      const signedEvent = finalizeEvent(unsignedPoWEvent, sk);
      publish(signedEvent);
      setSignedPoWEvent(signedEvent);
      setSk(generateSecretKey());
    }
  }, [unsignedPoWEvent]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setDoingWorkProp(true);

    if (settings.powServerUrl) {
      const inEventFormat = { ...unsignedWithPubkey, sig: "" };
      const powRequest = {
        req_event: inEventFormat,
        difficulty,
      };

      fetch(`${settings.powServerUrl}/powgen`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(powRequest),
      })
        .then((response) => response.json())
        .then((data) => {
          setUnsignedPoWEvent(data.event);
        })
        .catch((error) => {
          console.error("Error:", error);
          setDoingWorkProp(false);
        });
    } else {
      startWork();
    }

    appendKey(bytesToHex(sk), getPublicKey(sk));
  };

  useEffect(() => {
    if (messageFromWorker) {
      setUnsignedPoWEvent(messageFromWorker);
    }
  }, [messageFromWorker]);

  return { handleSubmit, doingWorkProp, hashrate, bestPow, signedPoWEvent };
};