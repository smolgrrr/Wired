import type { Event } from "nostr-tools";
import { parseRepost } from "../nostr/processing/repost";

const MAX_DEPTH = 3;

export function getThreadDepth(
  event: Event,
  rootId: string,
  eventsById: Map<string, Event>,
): number {
  if (event.id === rootId) return 0;

  if (event.kind === 6) {
    const reposted = parseRepost(event);
    if (reposted) {
      return getThreadDepth(reposted, rootId, eventsById);
    }
  }

  let depth = 0;
  let current: Event | undefined = event;
  const visited = new Set<string>();

  while (current && depth < MAX_DEPTH + 2) {
    if (visited.has(current.id)) break;
    visited.add(current.id);

    const parentTag =
      current.tags.find((tag) => tag[0] === "e" && tag[1] !== rootId) ??
      current.tags.find((tag) => tag[0] === "e");

    if (!parentTag?.[1]) break;
    if (parentTag[1] === rootId) return Math.min(depth + 1, MAX_DEPTH);

    current = eventsById.get(parentTag[1]);
    if (!current) return Math.min(depth + 1, MAX_DEPTH);

    depth++;
  }

  return Math.min(depth, MAX_DEPTH);
}