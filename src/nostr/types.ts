import type { Event } from "nostr-tools";

export type ProcessedEvent = {
  postEvent: Event;
  replies: Event[];
  totalWork: number;
  rootWork?: number;
  replyWork?: number;
  rankingReplyCount?: number;
  threadReplyCount?: number;
};

export type SubCallback = (event: Event, relay: string) => void;

export type SubHandle = {
  id: string;
  close: () => void;
};

export type StoredKey = readonly [secretHex: string, pubkey: string];
