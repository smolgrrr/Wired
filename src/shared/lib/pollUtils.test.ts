import type { Event } from "nostr-tools";
import { describe, expect, it, vi } from "vitest";
import {
  buildPollResponseDraft,
  getNoteBodyText,
  getPollOptionResults,
  getPollViewModel,
  POLL_EVENT_KIND,
  POLL_RESPONSE_KIND,
} from "./pollUtils";

const baseEvent = {
  id: "poll-1",
  pubkey: "pubkey",
  created_at: 1,
  sig: "sig",
  content: "poll content",
} as Event;

describe("pollUtils", () => {
  it("builds a poll view model from poll tags", () => {
    const event = {
      ...baseEvent,
      kind: POLL_EVENT_KIND,
      tags: [
        ["label", "choose one"],
        ["PoW", "12"],
        ["option", "a", "Alpha"],
        ["option", "b", "Beta"],
        ["option", "a", "Duplicate Alpha"],
        ["option", "missing-label"],
      ],
    } as Event;

    expect(getPollViewModel(event)).toEqual({
      id: "poll-1",
      label: "choose one",
      minDifficulty: "12",
      options: [
        { id: "a", label: "Duplicate Alpha" },
        { id: "b", label: "Beta" },
      ],
    });
  });

  it("returns null for non-poll events", () => {
    expect(getPollViewModel({ ...baseEvent, kind: 1, tags: [] } as Event)).toBeNull();
  });

  it("uses the poll label as body text when parsed content is empty", () => {
    const event = {
      ...baseEvent,
      kind: POLL_EVENT_KIND,
      content: "fallback content",
      tags: [["label", "fallback label"]],
    } as Event;

    expect(getNoteBodyText(event, "   ")).toBe("fallback label");
    expect(getNoteBodyText(event, "visible body")).toBe("visible body");
  });

  it("builds response drafts with the selected response tag only when selected", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    expect(buildPollResponseDraft("poll-1", "")).toEqual({
      kind: POLL_RESPONSE_KIND,
      tags: [["client", "getwired.app"], ["e", "poll-1"]],
      content: "",
      created_at: 1767225600,
      pubkey: "",
    });

    expect(buildPollResponseDraft("poll-1", "a").tags).toEqual([
      ["client", "getwired.app"],
      ["e", "poll-1"],
      ["response", "a"],
    ]);

    vi.useRealTimers();
  });

  it("counts unique response events by option id", () => {
    const options = [
      { id: "a", label: "Alpha" },
      { id: "b", label: "Beta" },
    ];
    const votes = [
      { ...baseEvent, id: "vote-1", tags: [["response", "a"]] },
      { ...baseEvent, id: "vote-1", tags: [["response", "a"]] },
      { ...baseEvent, id: "vote-2", tags: [["response", "b"]] },
      { ...baseEvent, id: "vote-3", tags: [["response", "unknown"]] },
      { ...baseEvent, id: "vote-4", tags: [] },
    ] as Event[];

    expect(getPollOptionResults(options, votes)).toEqual([
      { id: "a", label: "Alpha", voteCount: 1 },
      { id: "b", label: "Beta", voteCount: 1 },
    ]);
  });
});
