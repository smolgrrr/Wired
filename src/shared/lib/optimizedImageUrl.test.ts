import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isOptimizableImageUrl,
  optimizedAvatarUrl,
  optimizedImageSrcSet,
  optimizedImageUrl,
  pickOptimizedWidth,
} from "./optimizedImageUrl";

describe("optimizedImageUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns optimized URL for allowlisted hosts in production", () => {
    vi.stubEnv("DEV", false);

    const url = "https://image.nostr.build/abc123.jpg";
    expect(optimizedImageUrl(url, 828)).toBe(
      "/_vercel/image?url=https%3A%2F%2Fimage.nostr.build%2Fabc123.jpg&w=828&q=75",
    );
  });

  it("returns original URL in dev mode", () => {
    vi.stubEnv("DEV", true);

    const url = "https://image.nostr.build/abc123.jpg";
    expect(optimizedImageUrl(url, 828)).toBe(url);
    expect(isOptimizableImageUrl(url)).toBe(false);
  });

  it("skips gif and svg extensions", () => {
    vi.stubEnv("DEV", false);

    const gif = "https://i.nostr.build/avatar.gif";
    const svg = "https://image.nostr.build/logo.svg";

    expect(isOptimizableImageUrl(gif)).toBe(false);
    expect(isOptimizableImageUrl(svg)).toBe(false);
    expect(optimizedImageUrl(gif, 48)).toBe(gif);
    expect(optimizedImageUrl(svg, 48)).toBe(svg);
  });

  it("returns original URL for unknown hostnames", () => {
    vi.stubEnv("DEV", false);

    const url = "https://unknown.example/photo.jpg";
    expect(isOptimizableImageUrl(url)).toBe(false);
    expect(optimizedImageUrl(url, 828)).toBe(url);
  });

  it("snaps widths to allowed sizes", () => {
    expect(pickOptimizedWidth(1920, 1200)).toBe(1200);
    expect(pickOptimizedWidth(550)).toBe(640);
    expect(pickOptimizedWidth(40, 96)).toBe(48);
  });

  it("builds avatar URLs at retina width", () => {
    vi.stubEnv("DEV", false);

    const url = "https://i.nostr.build/avatar.jpg";
    expect(optimizedAvatarUrl(url, 20)).toBe(
      "/_vercel/image?url=https%3A%2F%2Fi.nostr.build%2Favatar.jpg&w=48&q=75",
    );
    expect(optimizedAvatarUrl(url, 24)).toBe(
      "/_vercel/image?url=https%3A%2F%2Fi.nostr.build%2Favatar.jpg&w=48&q=75",
    );
  });

  it("builds srcset for responsive images", () => {
    vi.stubEnv("DEV", false);

    const url = "https://image.nostr.build/photo.jpg";
    expect(optimizedImageSrcSet(url, [640, 828])).toBe(
      "/_vercel/image?url=https%3A%2F%2Fimage.nostr.build%2Fphoto.jpg&w=640&q=75 640w, /_vercel/image?url=https%3A%2F%2Fimage.nostr.build%2Fphoto.jpg&w=828&q=75 828w",
    );
  });

  it("returns undefined srcset when optimization is disabled", () => {
    vi.stubEnv("DEV", true);

    const url = "https://image.nostr.build/photo.jpg";
    expect(optimizedImageSrcSet(url, [640, 828])).toBeUndefined();
  });
});