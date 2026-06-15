import { describe, expect, it } from "vitest";
import type { Attachment } from "./content";
import { segmentAttachments } from "./attachmentSegments";

describe("segmentAttachments", () => {
  it("groups consecutive images into a grid segment", () => {
    const attachments: Attachment[] = [
      { kind: "media", item: { url: "https://example.com/1.jpg", type: "image" } },
      { kind: "media", item: { url: "https://example.com/2.jpg", type: "image" } },
    ];

    expect(segmentAttachments(attachments)).toEqual([
      {
        kind: "imageGrid",
        items: [
          { url: "https://example.com/1.jpg", type: "image" },
          { url: "https://example.com/2.jpg", type: "image" },
        ],
        hiddenCount: 0,
      },
    ]);
  });

  it("keeps a single image as a full-width item", () => {
    const attachments: Attachment[] = [
      { kind: "media", item: { url: "https://example.com/1.jpg", type: "image" } },
    ];

    expect(segmentAttachments(attachments)).toEqual([
      {
        kind: "item",
        attachment: {
          kind: "media",
          item: { url: "https://example.com/1.jpg", type: "image" },
        },
      },
    ]);
  });

  it("breaks image runs on links and non-image media", () => {
    const attachments: Attachment[] = [
      { kind: "media", item: { url: "https://example.com/1.jpg", type: "image" } },
      { kind: "link", item: { url: "https://example.com/article" } },
      { kind: "media", item: { url: "https://example.com/2.jpg", type: "image" } },
      { kind: "media", item: { url: "https://example.com/clip.mp4", type: "video" } },
      { kind: "media", item: { url: "https://example.com/3.jpg", type: "image" } },
    ];

    expect(segmentAttachments(attachments)).toEqual([
      {
        kind: "item",
        attachment: {
          kind: "media",
          item: { url: "https://example.com/1.jpg", type: "image" },
        },
      },
      { kind: "item", attachment: { kind: "link", item: { url: "https://example.com/article" } } },
      {
        kind: "item",
        attachment: {
          kind: "media",
          item: { url: "https://example.com/2.jpg", type: "image" },
        },
      },
      {
        kind: "item",
        attachment: {
          kind: "media",
          item: { url: "https://example.com/clip.mp4", type: "video" },
        },
      },
      {
        kind: "item",
        attachment: {
          kind: "media",
          item: { url: "https://example.com/3.jpg", type: "image" },
        },
      },
    ]);
  });

  it("caps grids at four visible images with a hidden count", () => {
    const attachments: Attachment[] = Array.from({ length: 6 }, (_, index) => ({
      kind: "media" as const,
      item: {
        url: `https://example.com/${index + 1}.jpg`,
        type: "image" as const,
      },
    }));

    expect(segmentAttachments(attachments)).toEqual([
      {
        kind: "imageGrid",
        items: Array.from({ length: 4 }, (_, index) => ({
          url: `https://example.com/${index + 1}.jpg`,
          type: "image",
        })),
        hiddenCount: 2,
      },
    ]);
  });
});