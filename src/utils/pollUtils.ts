import { Event } from "nostr-tools";

export function getPollOptions(event: Event): [string, string][] {
  if (event.kind !== 1068) return [];

  const uniqueOptions = new Map<string, string>();
  event.tags.forEach((tag) => {
    if (tag[0] === "option" && tag[1] && tag[2]) {
      uniqueOptions.set(tag[1], tag[2]);
    }
  });

  return Array.from(uniqueOptions.entries());
}

export function getPollLabel(event: Event): string {
  return event.tags.find((tag) => tag[0] === "label")?.[1] ?? event.content;
}