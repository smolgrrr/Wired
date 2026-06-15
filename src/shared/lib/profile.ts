import type { Event } from "nostr-tools";

export type ProfileMetadata = {
  name?: string;
  displayName?: string;
  picture?: string;
};

type RawProfileContent = {
  name?: unknown;
  display_name?: unknown;
  displayName?: unknown;
  picture?: unknown;
};

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizePictureUrl(value: unknown): string | undefined {
  const picture = asNonEmptyString(value);
  if (!picture) return undefined;
  try {
    const url = new URL(picture);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

export function parseProfileContent(content: string): ProfileMetadata | null {
  try {
    const raw = JSON.parse(content) as RawProfileContent;
    const profile: ProfileMetadata = {
      name: asNonEmptyString(raw.name),
      displayName:
        asNonEmptyString(raw.display_name) ?? asNonEmptyString(raw.displayName),
      picture: normalizePictureUrl(raw.picture),
    };

    if (!profile.name && !profile.displayName && !profile.picture) {
      return null;
    }

    return profile;
  } catch {
    return null;
  }
}

export function parseProfileEvent(event: Event): ProfileMetadata | null {
  if (event.kind !== 0) return null;
  return parseProfileContent(event.content);
}

export function getDisplayName(
  profile: ProfileMetadata | undefined,
  pubkey: string,
): string {
  return profile?.displayName ?? profile?.name ?? pubkey.slice(0, 8);
}