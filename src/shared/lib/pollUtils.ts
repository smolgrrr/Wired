import { Event, UnsignedEvent } from "nostr-tools";

export const POLL_EVENT_KIND = 1068;
export const POLL_RESPONSE_KIND = 1018;
export const POLL_CLIENT_TAG = ["client", "getwired.app"] as const;

export type PollOption = {
  id: string;
  label: string;
};

export type PollViewModel = {
  id: string;
  label: string;
  options: PollOption[];
  minDifficulty: string;
};

export type PollOptionResult = PollOption & {
  voteCount: number;
};

export function getPollOptions(event: Event): PollOption[] {
  if (event.kind !== POLL_EVENT_KIND) return [];

  const uniqueOptions = new Map<string, string>();
  event.tags.forEach((tag) => {
    if (tag[0] === "option" && tag[1] && tag[2]) {
      uniqueOptions.set(tag[1], tag[2]);
    }
  });

  return Array.from(uniqueOptions, ([id, label]) => ({ id, label }));
}

export function getPollLabel(event: Event): string {
  return event.tags.find((tag) => tag[0] === "label")?.[1] ?? event.content;
}

export function getPollMinDifficulty(event: Event): string {
  return event.tags.find((tag) => tag[0] === "PoW")?.[1] || "0";
}

export function getPollViewModel(event: Event): PollViewModel | null {
  if (event.kind !== POLL_EVENT_KIND) return null;

  return {
    id: event.id,
    label: getPollLabel(event),
    options: getPollOptions(event),
    minDifficulty: getPollMinDifficulty(event),
  };
}

export function getNoteBodyText(event: Event, comment: string): string {
  const poll = getPollViewModel(event);

  return poll ? comment.trim() || poll.label : comment;
}

export function buildPollResponseDraft(pollId: string, selectedOptionId: string): UnsignedEvent {
  const tags: string[][] = [[...POLL_CLIENT_TAG], ["e", pollId]];

  if (selectedOptionId) {
    tags.push(["response", selectedOptionId]);
  }

  return {
    kind: POLL_RESPONSE_KIND,
    tags,
    content: "",
    created_at: Math.floor(Date.now() / 1000),
    pubkey: "",
  };
}

export function getPollResponseOptionId(event: Event): string | null {
  return event.tags.find((tag) => tag[0] === "response")?.[1] ?? null;
}

export function getPollOptionResults(options: PollOption[], voteEvents: Event[]): PollOptionResult[] {
  const optionIds = new Set(options.map((option) => option.id));
  const voteCounts = new Map(options.map((option) => [option.id, 0]));
  const seenVoteIds = new Set<string>();

  voteEvents.forEach((event) => {
    if (seenVoteIds.has(event.id)) return;
    seenVoteIds.add(event.id);

    const optionId = getPollResponseOptionId(event);
    if (!optionId || !optionIds.has(optionId)) return;

    voteCounts.set(optionId, (voteCounts.get(optionId) ?? 0) + 1);
  });

  return options.map((option) => ({
    ...option,
    voteCount: voteCounts.get(option.id) ?? 0,
  }));
}
