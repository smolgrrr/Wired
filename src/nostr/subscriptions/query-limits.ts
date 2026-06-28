import type { Filter } from "nostr-tools";

export const DEFAULT_THREAD_AGE_HOURS = 24;
export const MAX_REPLY_FETCH_DEPTH = 2;
export const MAX_REPLY_PARENT_IDS = 50;
export const REPLY_QUERY_LIMIT = 100;
export const PROFILE_QUERY_LIMIT = 250;

export function sinceFromAgeHours(
  ageHours: number,
  now = Math.floor(Date.now() / 1000),
): number {
  return now - ageHours * 60 * 60;
}

export function clampReplyDepth(depth: number): number {
  return Math.max(0, Math.min(depth, MAX_REPLY_FETCH_DEPTH));
}

export function limitReplyParentIds(parentIds: readonly string[]): string[] {
  return parentIds.slice(0, MAX_REPLY_PARENT_IDS);
}

export function buildReplyFilter(
  parentIds: readonly string[],
  since: number,
): Filter | null {
  const limitedParentIds = limitReplyParentIds(parentIds);
  if (limitedParentIds.length === 0) return null;

  return {
    "#e": limitedParentIds,
    kinds: [1],
    since,
    limit: REPLY_QUERY_LIMIT,
  };
}

export function profileQueryLimit(pubkeyCount: number): number {
  return Math.min(pubkeyCount, PROFILE_QUERY_LIMIT);
}
