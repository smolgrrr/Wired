import { getEmojiDisplayUrls } from "@lib/customEmoji";

export type CustomEmoji = {
  shortcode: string;
  previewUrl: string;
  url: string;
};

type CatalogState = {
  status: "idle" | "loading" | "ready" | "error";
  emojis: CustomEmoji[];
};

export type EmojiGroup = {
  label: string;
  matches: (shortcode: string) => boolean;
};

export const EMOJI_GROUPS: EmojiGroup[] = [
  { label: "0-9", matches: (shortcode) => /^[0-9]/.test(shortcode) },
  { label: "A-E", matches: (shortcode) => /^[a-e]/i.test(shortcode) },
  { label: "F-J", matches: (shortcode) => /^[f-j]/i.test(shortcode) },
  { label: "K-N", matches: (shortcode) => /^[k-n]/i.test(shortcode) },
  { label: "O-R", matches: (shortcode) => /^[o-r]/i.test(shortcode) },
  { label: "S-V", matches: (shortcode) => /^[s-v]/i.test(shortcode) },
  { label: "W-Z", matches: (shortcode) => /^[w-z]/i.test(shortcode) },
];

let catalogState: CatalogState = {
  status: "idle",
  emojis: [],
};
let catalogLoadPromise: Promise<CustomEmoji[]> | null = null;
const catalogListeners = new Set<() => void>();
const prewarmedUrls = new Set<string>();

function setCatalogState(nextState: CatalogState) {
  catalogState = nextState;
  catalogListeners.forEach((listener) => listener());
}

function toCustomEmojis(rawCatalog: [string, string, string][]): CustomEmoji[] {
  return rawCatalog.map(([shortcode, previewUrl, url]) => ({
    shortcode,
    previewUrl,
    url,
  }));
}

export function getCustomEmojiCatalogState() {
  return catalogState;
}

export function subscribeCustomEmojiCatalog(listener: () => void) {
  catalogListeners.add(listener);

  return () => {
    catalogListeners.delete(listener);
  };
}

export function loadCustomEmojiCatalog() {
  if (catalogState.status === "ready") {
    return Promise.resolve(catalogState.emojis);
  }

  if (catalogLoadPromise) {
    return catalogLoadPromise;
  }

  setCatalogState({ status: "loading", emojis: [] });

  catalogLoadPromise = import("./customEmojiCatalog.generated.json")
    .then((module) => {
      const emojis = toCustomEmojis(module.default as [string, string, string][]);
      setCatalogState({ status: "ready", emojis });
      return emojis;
    })
    .catch((error: unknown) => {
      catalogLoadPromise = null;
      setCatalogState({ status: "error", emojis: [] });
      throw error;
    });

  return catalogLoadPromise;
}

export function filterCustomEmojis(emojis: CustomEmoji[], search: string, activeGroup: number): CustomEmoji[] {
  const query = search.trim().toLowerCase();
  const group = EMOJI_GROUPS[activeGroup] ?? EMOJI_GROUPS[0];

  if (query) {
    return emojis.filter((emoji) => emoji.shortcode.toLowerCase().includes(query));
  }

  return emojis.filter((emoji) => group.matches(emoji.shortcode));
}

export function prewarmCustomEmojiImages(emojis: CustomEmoji[], limit = 64) {
  if (typeof window === "undefined") return;

  const warm = () => {
    for (const emoji of emojis.slice(0, limit)) {
      const [displayUrl] = getEmojiDisplayUrls(emoji.previewUrl);
      if (!displayUrl || prewarmedUrls.has(displayUrl)) continue;

      prewarmedUrls.add(displayUrl);
      const image = new Image();
      image.decoding = "async";
      image.src = displayUrl;
    }
  };

  if ("requestIdleCallback" in globalThis) {
    globalThis.requestIdleCallback(warm, { timeout: 2000 });
    return;
  }

  globalThis.setTimeout(warm, 250);
}

export function prewarmInitialCustomEmojis() {
  void loadCustomEmojiCatalog()
    .then((emojis) => {
      prewarmCustomEmojiImages(filterCustomEmojis(emojis, "", 0));
    })
    .catch(() => undefined);
}
