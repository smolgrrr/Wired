import type { Event } from "nostr-tools";

export const parseRepost = (event: Event): Event | null => {
  if (event.kind !== 6) return event;

  try {
    const reposted = JSON.parse(event.content) as Event;
    return reposted?.id && reposted?.pubkey ? reposted : null;
  } catch {
    return null;
  }
};