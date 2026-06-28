import { useEffect, useState } from "react";
import {
  EMPTY_MODERATION_MANIFEST,
  type ModerationManifest,
} from "../lib/moderation";

export const MODERATION_MANIFEST_URL_ENV = "VITE_MODERATION_MANIFEST_URL";
const MODERATION_MANIFEST_REFRESH_MS = 30_000;

function configuredModerationManifestUrl(): string | null {
  const url = import.meta.env[MODERATION_MANIFEST_URL_ENV]?.trim();
  return url || null;
}

function isModerationManifest(value: unknown): value is ModerationManifest {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<ModerationManifest>;
  return (
    typeof candidate.updatedAt === "number" &&
    Array.isArray(candidate.blockedEventIds) &&
    Array.isArray(candidate.blockedThreadRoots) &&
    Array.isArray(candidate.blockedMediaUrls) &&
    Array.isArray(candidate.blockedDomains) &&
    Array.isArray(candidate.blockedContentFingerprints)
  );
}

export function useModerationManifest(): ModerationManifest {
  const [manifest, setManifest] = useState<ModerationManifest>(
    EMPTY_MODERATION_MANIFEST,
  );

  useEffect(() => {
    const url = configuredModerationManifestUrl();
    if (!url) {
      setManifest(EMPTY_MODERATION_MANIFEST);
      return;
    }

    let cancelled = false;

    const fetchManifest = () => {
      void fetch(url)
        .then(async (response) => {
          if (!response.ok) return null;
          return response.json() as Promise<unknown>;
        })
        .then((payload) => {
          if (cancelled || !isModerationManifest(payload)) return;
          setManifest(payload);
        })
        .catch(() => {
          // Moderation filtering is fail-open so relay availability is not affected.
        });
    };

    fetchManifest();
    const interval = window.setInterval(
      fetchManifest,
      MODERATION_MANIFEST_REFRESH_MS,
    );

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return manifest;
}
