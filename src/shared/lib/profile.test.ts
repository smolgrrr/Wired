import { describe, expect, it } from "vitest";
import type { Event } from "nostr-tools";
import { getDisplayName, parseProfileContent, parseProfileEvent } from "./profile";

const DANIEL_PROFILE_CONTENT =
  '{"name":"daniel","display_name":"The Daniel 🖖","picture":"https://i.nostr.build/KGJksCZoAibDjiXu.gif","nip05":"daniel@nodestrich.com"}';

describe("parseProfileContent", () => {
  it("parses display name and picture from kind-0 JSON", () => {
    expect(parseProfileContent(DANIEL_PROFILE_CONTENT)).toEqual({
      name: "daniel",
      displayName: "The Daniel 🖖",
      picture: "https://i.nostr.build/KGJksCZoAibDjiXu.gif",
    });
  });

  it("accepts displayName camelCase", () => {
    expect(
      parseProfileContent('{"name":"alice","displayName":"Alice A"}'),
    ).toEqual({
      name: "alice",
      displayName: "Alice A",
      picture: undefined,
    });
  });

  it("returns null for invalid JSON", () => {
    expect(parseProfileContent("not-json")).toBeNull();
  });

  it("returns null when no usable fields exist", () => {
    expect(parseProfileContent("{}")).toBeNull();
    expect(parseProfileContent('{"picture":"ftp://bad.example/a.png"}')).toBeNull();
  });
});

describe("parseProfileEvent", () => {
  it("parses kind-0 events only", () => {
    const event = {
      kind: 0,
      content: DANIEL_PROFILE_CONTENT,
    } as Event;

    expect(parseProfileEvent(event)?.displayName).toBe("The Daniel 🖖");
    expect(parseProfileEvent({ kind: 1, content: "{}" } as Event)).toBeNull();
  });
});

describe("getDisplayName", () => {
  it("prefers display name, then name, then pubkey prefix", () => {
    expect(
      getDisplayName(
        { displayName: "The Daniel 🖖", name: "daniel" },
        "ee6ea13ab9fe5c4a68eaf9b1a34fe014a66b40117c50ee2a614f4cda959b6e74",
      ),
    ).toBe("The Daniel 🖖");

    expect(
      getDisplayName({ name: "daniel" }, "ee6ea13ab9fe5c4a68eaf9b1a34fe014a66b40117c50ee2a614f4cda959b6e74"),
    ).toBe("daniel");

    expect(getDisplayName(undefined, "ee6ea13ab9fe5c4a68eaf9b1a34fe014a66b40117c50ee2a614f4cda959b6e74")).toBe(
      "ee6ea13a",
    );
  });
});