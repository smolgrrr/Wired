import { Event } from "nostr-tools";

export function parseContent(event: Event) {
  return {
    comment: event.content,
  };
}
