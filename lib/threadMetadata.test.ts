import { describe, expect, it } from "vitest";
import {
  buildThreadMetadata,
  injectThreadMetadata,
  metadataTags,
} from "./threadMetadata";

describe("thread metadata", () => {
  const metadata = buildThreadMetadata(
    { eventId: "1".repeat(64), excerpt: 'Signal <script> "quoted"', replyCount: 1 },
    "https://wiredsignal.online/thread/example",
    "https://wiredsignal.online/api/thread-card?id=example",
  );

  it("describes the thread and pluralizes replies", () => {
    expect(metadata.title).toContain("Signal <script>");
    expect(metadata.description).toContain("1 reply on Wired");
  });

  it("escapes user content in social metadata", () => {
    const tags = metadataTags(metadata);
    expect(tags).toContain("Signal &lt;script&gt; &quot;quoted&quot;");
    expect(tags).not.toContain("<script>");
    expect(tags).toContain('name="twitter:card" content="summary_large_image"');
    expect(tags).toContain('property="og:image:width" content="1200"');
  });

  it("injects crawler metadata into the initial HTML shell", () => {
    const html = injectThreadMetadata(
      '<html><head><meta name="description" content="The Wired" /><title>The Wired</title></head></html>',
      metadata,
    );
    expect(html).toContain("<title>Signal &lt;script&gt;");
    expect(html).toContain('rel="canonical"');
    expect(html).toContain('property="og:title"');
    expect(html).not.toContain('content="The Wired"');
  });
});
