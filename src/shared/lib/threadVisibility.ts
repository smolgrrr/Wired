import type { Event } from "nostr-tools";

export function isThreadDescendant(
  event: Event,
  rootId: string,
  eventsById: Map<string, Event>,
): boolean {
  const visited = new Set<string>();
  const pending = event.tags
    .filter((tag) => tag[0] === "e" && Boolean(tag[1]))
    .map((tag) => tag[1]);

  while (pending.length > 0) {
    const candidateId = pending.shift();
    if (!candidateId || visited.has(candidateId)) continue;
    if (candidateId === rootId) return true;

    visited.add(candidateId);
    const candidate = eventsById.get(candidateId);
    if (!candidate) continue;

    pending.push(
      ...candidate.tags
        .filter((tag) => tag[0] === "e" && Boolean(tag[1]))
        .map((tag) => tag[1]),
    );
  }

  return false;
}
