import { Event, UnsignedEvent } from "nostr-tools";

export type ComposeDraft = {
  comment: string;
  refEvent?: Event;
  tagType?: "Reply" | "Quote" | "";
  pollOptions: string[];
  pollDifficulty: string;
};

const CLIENT_TAG: string[] = ["client", "getwired.app"];

function dedupeTags(tags: string[][]): string[][] {
  return Array.from(
    new Map(tags.map((tag) => [tag.join("\0"), tag])).values(),
  );
}

function buildRefTags(refEvent: Event, tagType: "Reply" | "Quote" | ""): string[][] {
  const tags: string[][] = [];

  if (tagType === "Quote") {
    tags.push(["p", refEvent.pubkey], ["q", refEvent.id]);
    return tags;
  }

  tags.push(["p", refEvent.pubkey]);
  tags.push(
    ...refEvent.tags.filter((tag) => tag[0] === "e" || tag[0] === "p"),
  );
  tags.push(["e", refEvent.id]);
  return dedupeTags(tags);
}

function buildPollTags(
  comment: string,
  pollOptions: string[],
  pollDifficulty: string,
): string[][] {
  const generateOptionId = () => Math.random().toString(36).substring(2, 11);

  return [
    ["label", comment],
    ...pollOptions
      .filter((option) => option !== "")
      .map((option) => ["option", generateOptionId(), option]),
    ["relay", "wss://relay.damus.io/"],
    ["relay", "wss://nos.lol"],
    ["PoW", pollDifficulty],
    ["polltype", "singlechoice"],
  ];
}

export function buildUnsignedEvent(draft: ComposeDraft): UnsignedEvent {
  const { comment, refEvent, tagType = "", pollOptions, pollDifficulty } = draft;
  const created_at = Math.floor(Date.now() / 1000);
  const refTags =
    refEvent && tagType ? buildRefTags(refEvent, tagType) : [];
  const isPoll = pollOptions.some((option) => option !== "");

  if (isPoll) {
    return {
      kind: 1068,
      tags: dedupeTags([CLIENT_TAG, ...refTags, ...buildPollTags(comment, pollOptions, pollDifficulty)]),
      content: comment,
      created_at,
      pubkey: "",
    };
  }

  return {
    kind: 1,
    tags: dedupeTags([CLIENT_TAG, ...refTags]),
    content: comment,
    created_at,
    pubkey: "",
  };
}