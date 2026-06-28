import { getCache } from "@vercel/functions";
import {
  BOOTSTRAP_CACHE_KEY,
  BOOTSTRAP_CACHE_TAG,
  BOOTSTRAP_CACHE_TTL_SECONDS,
} from "./feedBootstrap.js";
import { fetchFeedSnapshot, type FeedBootstrapSnapshot } from "./feedSnapshot.js";

let memorySnapshot: FeedBootstrapSnapshot | null = null;

export async function readFeedBootstrapSnapshot(): Promise<FeedBootstrapSnapshot | null> {
  if (memorySnapshot) {
    return memorySnapshot;
  }

  try {
    const cache = getCache();
    const cached = await cache.get(BOOTSTRAP_CACHE_KEY);
    if (cached && typeof cached === "object" && "processedEvents" in cached) {
      memorySnapshot = cached as FeedBootstrapSnapshot;
      return memorySnapshot;
    }
  } catch {
    // Runtime cache is unavailable outside Vercel.
  }

  return null;
}

export async function writeFeedBootstrapSnapshot(
  snapshot: FeedBootstrapSnapshot,
): Promise<void> {
  memorySnapshot = snapshot;

  try {
    const cache = getCache();
    await cache.set(BOOTSTRAP_CACHE_KEY, snapshot, {
      ttl: BOOTSTRAP_CACHE_TTL_SECONDS,
      tags: [BOOTSTRAP_CACHE_TAG],
      name: "feed-bootstrap",
    });
  } catch {
    // Runtime cache is unavailable outside Vercel.
  }
}

export async function refreshFeedBootstrapSnapshot(): Promise<FeedBootstrapSnapshot> {
  const snapshot = await fetchFeedSnapshot();
  await writeFeedBootstrapSnapshot(snapshot);
  return snapshot;
}

export async function getFeedBootstrapSnapshot(): Promise<FeedBootstrapSnapshot | null> {
  const cached = await readFeedBootstrapSnapshot();
  if (cached) {
    return cached;
  }

  if (process.env.NODE_ENV === "production") {
    return null;
  }

  try {
    return await refreshFeedBootstrapSnapshot();
  } catch {
    return null;
  }
}
