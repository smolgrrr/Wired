import type { Event } from "nostr-tools";
import { uniqBy } from "./collections.js";

export const isRootNote = (event: Event): boolean =>
  event.kind === 1 && !event.tags.some((tag) => tag[0] === "e");

export const filterNoteEvents = (events: Event[]): Event[] =>
  uniqBy(events, "id").filter(
    (event) => event.kind === 1 || event.kind === 6 || event.kind === 1068,
  );