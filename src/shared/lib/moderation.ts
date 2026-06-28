import type { Event } from "nostr-tools";
import { normalizeUrl } from "../../../lib/link";

export type ModerationActionKind =
  | "block_event"
  | "block_thread"
  | "block_media_url"
  | "block_domain"
  | "block_content_fingerprint";

export type ModerationReason = "illegal" | "spam" | "abuse" | "manual";

export type ModerationAction = {
  id: string;
  kind: ModerationActionKind;
  value: string;
  reason: ModerationReason;
  note?: string;
  createdAt: number;
  moderator: string;
};

export type ModerationManifest = {
  updatedAt: number;
  blockedEventIds: string[];
  blockedThreadRoots: string[];
  blockedMediaUrls: string[];
  blockedDomains: string[];
  blockedContentFingerprints: string[];
};

export const EMPTY_MODERATION_MANIFEST: ModerationManifest = {
  updatedAt: 0,
  blockedEventIds: [],
  blockedThreadRoots: [],
  blockedMediaUrls: [],
  blockedDomains: [],
  blockedContentFingerprints: [],
};

const HTTP_URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/gi;
const MEDIA_EXTENSION_PATTERN =
  /\.(?:jpe?g|png|gif|webp|mp4|webm|mov|mp3|wav|ogg|m4a)(?:\?|$)/i;

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set([...values].filter(Boolean))].sort();
}

function domainFromUrl(value: string): string | null {
  const normalized = normalizeUrl(value);
  if (!normalized) return null;

  try {
    return new URL(normalized).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function imetaUrls(event: Event): string[] {
  return event.tags
    .filter((tag) => tag[0] === "imeta")
    .flatMap((tag) =>
      tag
        .slice(1)
        .filter((part) => part.startsWith("url "))
        .map((part) => part.slice("url ".length).trim()),
    );
}

function eventUrls(event: Event): string[] {
  const contentUrls = [...event.content.matchAll(HTTP_URL_PATTERN)].map(
    (match) => match[0],
  );

  return uniqueSorted(
    [...contentUrls, ...imetaUrls(event)]
      .map((url) => normalizeUrl(url))
      .filter((url): url is string => Boolean(url)),
  );
}

function domainsFromEvent(event: Event): string[] {
  return eventUrls(event)
    .map(domainFromUrl)
    .filter((domain): domain is string => Boolean(domain));
}

function mediaUrlsFromEvent(event: Event): string[] {
  return uniqueSorted(
    eventUrls(event).filter((url) => MEDIA_EXTENSION_PATTERN.test(url)),
  );
}

function parsedRepostEvent(event: Event): Event | null {
  if (event.kind !== 6) return null;

  try {
    const parsed = JSON.parse(event.content) as Partial<Event>;
    if (
      typeof parsed.id !== "string" ||
      typeof parsed.pubkey !== "string" ||
      typeof parsed.content !== "string" ||
      !Array.isArray(parsed.tags) ||
      typeof parsed.created_at !== "number" ||
      typeof parsed.kind !== "number" ||
      typeof parsed.sig !== "string"
    ) {
      return null;
    }

    return parsed as Event;
  } catch {
    return null;
  }
}

function visibleEventVariants(event: Event): Event[] {
  const repost = parsedRepostEvent(event);
  return repost ? [event, repost] : [event];
}

function rootReferences(event: Event): string[] {
  return event.tags
    .filter((tag) => tag[0] === "e" && tag[1])
    .map((tag) => tag[1]);
}

function normalizeContentForFingerprint(content: string): string {
  return content
    .replace(HTTP_URL_PATTERN, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function contentFingerprint(content: string): string {
  const normalized = normalizeContentForFingerprint(content);
  let hash = 0x811c9dc5;

  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function normalizeModerationValue(
  kind: ModerationActionKind,
  value: string,
): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (kind === "block_domain") {
    return (
      trimmed
        .replace(/^https?:\/\//i, "")
        .replace(/^www\./i, "")
        .split("/")[0]
        .trim()
        .toLowerCase() || null
    );
  }

  if (kind === "block_media_url") {
    return normalizeUrl(trimmed);
  }

  if (kind === "block_content_fingerprint") {
    return trimmed.startsWith("fnv1a:") ? trimmed : contentFingerprint(trimmed);
  }

  return trimmed.toLowerCase();
}

export function manifestFromActions(actions: ModerationAction[]): ModerationManifest {
  const blockedEventIds = new Set<string>();
  const blockedThreadRoots = new Set<string>();
  const blockedMediaUrls = new Set<string>();
  const blockedDomains = new Set<string>();
  const blockedContentFingerprints = new Set<string>();

  for (const action of actions) {
    const normalized = normalizeModerationValue(action.kind, action.value);
    if (!normalized) continue;

    if (action.kind === "block_event") blockedEventIds.add(normalized);
    if (action.kind === "block_thread") {
      blockedEventIds.add(normalized);
      blockedThreadRoots.add(normalized);
    }
    if (action.kind === "block_media_url") blockedMediaUrls.add(normalized);
    if (action.kind === "block_domain") blockedDomains.add(normalized);
    if (action.kind === "block_content_fingerprint") {
      blockedContentFingerprints.add(normalized);
    }
  }

  return {
    updatedAt: actions.reduce(
      (latest, action) => Math.max(latest, action.createdAt),
      0,
    ),
    blockedEventIds: uniqueSorted(blockedEventIds),
    blockedThreadRoots: uniqueSorted(blockedThreadRoots),
    blockedMediaUrls: uniqueSorted(blockedMediaUrls),
    blockedDomains: uniqueSorted(blockedDomains),
    blockedContentFingerprints: uniqueSorted(blockedContentFingerprints),
  };
}

export function isEventModerated(
  event: Event,
  manifest: ModerationManifest,
): boolean {
  const variants = visibleEventVariants(event);
  const blockedEventIds = new Set(manifest.blockedEventIds);
  if (variants.some((variant) => blockedEventIds.has(variant.id.toLowerCase()))) {
    return true;
  }

  const blockedThreadRoots = new Set(manifest.blockedThreadRoots);
  if (
    variants.some((variant) =>
      rootReferences(variant).some((id) => blockedThreadRoots.has(id.toLowerCase())),
    )
  ) {
    return true;
  }

  const blockedMediaUrls = new Set(manifest.blockedMediaUrls);
  if (
    variants.some((variant) =>
      mediaUrlsFromEvent(variant).some((url) => blockedMediaUrls.has(url)),
    )
  ) {
    return true;
  }

  const blockedDomains = new Set(manifest.blockedDomains);
  if (
    variants.some((variant) =>
      domainsFromEvent(variant).some((domain) => blockedDomains.has(domain)),
    )
  ) {
    return true;
  }

  const blockedContentFingerprints = new Set(manifest.blockedContentFingerprints);
  return variants.some((variant) =>
    blockedContentFingerprints.has(contentFingerprint(variant.content)),
  );
}

export function filterModeratedEvents(
  events: Event[],
  manifest: ModerationManifest,
): Event[] {
  if (manifest.updatedAt === 0) return events;
  return events.filter((event) => !isEventModerated(event, manifest));
}
