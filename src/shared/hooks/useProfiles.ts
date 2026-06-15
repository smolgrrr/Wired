import { useEffect, useState } from "react";
import type { Event } from "nostr-tools";
import { subProfilesOnce } from "../../nostr/subscriptions";
import { parseProfileEvent, type ProfileMetadata } from "@lib/profile";

type CachedProfile = {
  profile: ProfileMetadata;
  createdAt: number;
};

const profileCache = new Map<string, CachedProfile>();
const pendingPubkeys = new Set<string>();
const listeners = new Set<() => void>();

let flushScheduled = false;
let inflightBatch: Promise<void> | null = null;

function notifyListeners(): void {
  listeners.forEach((listener) => listener());
}

function mergeProfileEvent(event: Event): void {
  const profile = parseProfileEvent(event);
  if (!profile) return;

  const existing = profileCache.get(event.pubkey);
  if (existing && existing.createdAt >= event.created_at) return;

  profileCache.set(event.pubkey, {
    profile,
    createdAt: event.created_at,
  });
}

function scheduleProfileFetch(pubkeys: string[]): void {
  pubkeys.forEach((pubkey) => {
    if (!profileCache.has(pubkey)) {
      pendingPubkeys.add(pubkey);
    }
  });

  if (pendingPubkeys.size === 0 || flushScheduled) return;

  flushScheduled = true;
  queueMicrotask(() => {
    flushScheduled = false;
    void flushProfileBatch();
  });
}

async function flushProfileBatch(): Promise<void> {
  if (inflightBatch) {
    await inflightBatch;
    if (pendingPubkeys.size > 0) {
      return flushProfileBatch();
    }
    return;
  }

  const pubkeys = [...pendingPubkeys];
  if (pubkeys.length === 0) return;

  pubkeys.forEach((pubkey) => pendingPubkeys.delete(pubkey));

  inflightBatch = (async () => {
    let handle: { close: () => void } | null = null;

    try {
      handle = subProfilesOnce(
        pubkeys,
        (event) => {
          mergeProfileEvent(event);
          notifyListeners();
        },
        () => {
          handle?.close();
        },
      );
    } finally {
      inflightBatch = null;
    }
  })();

  await inflightBatch;

  if (pendingPubkeys.size > 0) {
    await flushProfileBatch();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useProfile(pubkey: string): ProfileMetadata | undefined {
  const [, setVersion] = useState(0);

  useEffect(() => {
    if (!pubkey) return;
    return subscribe(() => {
      setVersion((version) => version + 1);
    });
  }, [pubkey]);

  useEffect(() => {
    if (!pubkey) return;
    scheduleProfileFetch([pubkey]);
  }, [pubkey]);

  return profileCache.get(pubkey)?.profile;
}