import type { Event } from "nostr-tools";
import { uniqBy } from "../../utils/otherUtils";

export const filterNoteEvents = (events: Event[]): Event[] =>
  uniqBy(events, "id").filter(
    (event) => event.kind === 1 || event.kind === 6 || event.kind === 1068,
  );