import { useEffect, useState } from "react";
import type { Event } from "nostr-tools";
import { PROFILE_REQUEST_JOIN_ENABLED } from "../../config";
import { subProfilesOnce } from "../../nostr/subscriptions";
import { parseProfileEvent, type ProfileMetadata } from "@lib/profile";

type CachedProfile = {
  profile: ProfileMetadata;
  createdAt: number;
};

const profileCache = new Map<string, CachedProfile>();
const pendingPubkeys = new Set<string>();
const inflightPubkeys = new Set<string>();
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
    if (
      !profileCache.has(pubkey) &&
      (!PROFILE_REQUEST_JOIN_ENABLED || !inflightPubkeys.has(pubkey))
    ) {
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
  if (PROFILE_REQUEST_JOIN_ENABLED) {
    pubkeys.forEach((pubkey) => inflightPubkeys.add(pubkey));
  }

  inflightBatch = (async () => {
    let handle: { close: () => void } | null = null;
    let queryCompleted = false;
    const completeRequest = () => {
      queryCompleted = true;
      if (PROFILE_REQUEST_JOIN_ENABLED) {
        pubkeys.forEach((pubkey) => inflightPubkeys.delete(pubkey));
      }
    };

    try {
      handle = await subProfilesOnce(
        pubkeys,
        (event) => {
          mergeProfileEvent(event);
          notifyListeners();
        },
        () => {
          completeRequest();
          handle?.close();
        },
        { onComplete: completeRequest },
      );
      if (queryCompleted) handle.close();
    } catch (error) {
      completeRequest();
      throw error;
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

export function seedProfiles(profiles: Record<string, ProfileMetadata>): void {
  let changed = false;

  Object.entries(profiles).forEach(([pubkey, profile]) => {
    const existing = profileCache.get(pubkey);
    if (existing?.profile === profile) return;

    profileCache.set(pubkey, {
      profile,
      createdAt: existing?.createdAt ?? Math.floor(Date.now() / 1000),
    });
    changed = true;
  });

  if (changed) {
    notifyListeners();
  }
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
