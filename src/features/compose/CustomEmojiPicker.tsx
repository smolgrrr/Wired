import { useEffect, useMemo, useRef, useState } from "react";
import { SmilePlus } from "lucide-react";
import { getEmojiDisplayUrls } from "@lib/customEmoji";
import { Button } from "../../shared/ui/Button";
import { Input } from "../../shared/ui/Input";
import {
  EMOJI_GROUPS,
  filterCustomEmojis,
  getCustomEmojiCatalogState,
  loadCustomEmojiCatalog,
  subscribeCustomEmojiCatalog,
  type CustomEmoji,
} from "./customEmojiCatalog";

const MAX_VISIBLE_EMOJIS = 120;
const FAILED_EMOJI_STORAGE_KEY = "wired.failedCustomEmojiPreviewUrls";
const MAX_STORED_FAILED_EMOJIS = 500;

type CustomEmojiPickerProps = {
  onSelect: (emoji: CustomEmoji) => void;
};

type EmojiButtonProps = {
  emoji: CustomEmoji;
  onSelect: () => void;
  onPreviewFailure: (urls: string[]) => void;
};

function loadFailedPreviewUrls() {
  if (typeof window === "undefined") return new Set<string>();

  try {
    const storedUrls = JSON.parse(window.localStorage.getItem(FAILED_EMOJI_STORAGE_KEY) ?? "[]") as unknown;

    if (!Array.isArray(storedUrls)) {
      return new Set<string>();
    }

    return new Set(storedUrls.filter((url): url is string => typeof url === "string"));
  } catch {
    return new Set<string>();
  }
}

function storeFailedPreviewUrls(urls: Set<string>) {
  if (typeof window === "undefined") return;

  const compactUrls = Array.from(urls).slice(-MAX_STORED_FAILED_EMOJIS);
  window.localStorage.setItem(FAILED_EMOJI_STORAGE_KEY, JSON.stringify(compactUrls));
}

function EmojiButton({ emoji, onSelect, onPreviewFailure }: EmojiButtonProps) {
  const displayUrls = getEmojiDisplayUrls(emoji.previewUrl);
  const [displayUrlIndex, setDisplayUrlIndex] = useState(0);
  const displayUrl = displayUrls[displayUrlIndex];

  if (!displayUrl) {
    return null;
  }

  return (
    <button
      type="button"
      title={`:${emoji.shortcode}:`}
      aria-label={`insert ${emoji.shortcode}`}
      className="flex aspect-square items-center justify-center rounded-sm border border-transparent p-1 hover:border-signal/30 hover:bg-signal-ghost focus-visible:border-signal"
      onClick={onSelect}
    >
      <img
        src={displayUrl}
        alt=""
        className="max-h-full max-w-full object-contain"
        onError={() => {
          if (displayUrlIndex + 1 < displayUrls.length) {
            setDisplayUrlIndex((current) => current + 1);
            return;
          }

          onPreviewFailure(displayUrls);
        }}
      />
    </button>
  );
}

export function CustomEmojiPicker({ onSelect }: CustomEmojiPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeGroup, setActiveGroup] = useState(0);
  const [catalogState, setCatalogState] = useState(getCustomEmojiCatalogState);
  const [failedPreviewUrls, setFailedPreviewUrls] = useState(loadFailedPreviewUrls);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsubscribe = subscribeCustomEmojiCatalog(() => {
      setCatalogState(getCustomEmojiCatalogState());
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    void loadCustomEmojiCatalog().catch(() => undefined);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (wrapperRef.current?.contains(event.target as Node)) return;
      setIsOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const filteredEmojis = useMemo(() => {
    const query = search.trim().toLowerCase();

    return filterCustomEmojis(catalogState.emojis, query, activeGroup).filter((emoji) => {
      const displayUrls = getEmojiDisplayUrls(emoji.previewUrl);

      return !displayUrls.some((url) => failedPreviewUrls.has(url));
    });
  }, [activeGroup, catalogState.emojis, failedPreviewUrls, search]);

  function handlePreviewFailure(urls: string[]) {
    setFailedPreviewUrls((current) => {
      if (urls.every((url) => current.has(url))) {
        return current;
      }

      const next = new Set(current);
      urls.forEach((url) => next.add(url));
      storeFailedPreviewUrls(next);
      return next;
    });
  }

  const visibleEmojis = filteredEmojis.slice(0, MAX_VISIBLE_EMOJIS);

  return (
    <div ref={wrapperRef} className="relative">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="open custom emoji picker"
        aria-expanded={isOpen}
        title="custom emoji"
        className="px-2"
        onClick={() => setIsOpen((current) => !current)}
      >
        <SmilePlus className="h-4 w-4" aria-hidden="true" />
      </Button>

      {isOpen && (
        <div className="fixed inset-x-3 bottom-20 z-50 max-h-[calc(100dvh-7rem)] rounded-sm border border-ghost bg-surface-raised shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-full sm:right-0 sm:mb-2 sm:max-h-none sm:w-[min(22rem,calc(100vw-2rem))]">
          <div className="border-b border-ghost p-2">
            <Input
              type="search"
              placeholder="search emotes"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="min-h-[36px] text-[16px]"
            />
          </div>

          {!search && (
            <div className="flex gap-1 overflow-x-auto border-b border-ghost p-2">
              {EMOJI_GROUPS.map((group, index) => (
                <Button
                  key={group.label}
                  type="button"
                  variant={activeGroup === index ? "primary" : "ghost"}
                  size="sm"
                  className="shrink-0 px-2"
                  onClick={() => setActiveGroup(index)}
                >
                  {group.label}
                </Button>
              ))}
            </div>
          )}

          <div className="h-[min(16rem,calc(100dvh-16rem))] min-h-40 overflow-y-auto p-2 sm:h-64">
            {visibleEmojis.length === 0 && (
              <p className="px-2 py-8 text-center text-meta text-secondary">
                {catalogState.status === "error"
                  ? "emotes failed to load"
                  : catalogState.status === "ready"
                    ? "no emotes found"
                    : "loading emotes"}
              </p>
            )}

            {visibleEmojis.length > 0 && (
              <div className="grid grid-cols-8 gap-1">
                {visibleEmojis.map((emoji) => (
                  <EmojiButton
                    key={`${emoji.shortcode}-${emoji.url}`}
                    emoji={emoji}
                    onSelect={() => {
                      onSelect(emoji);
                      setIsOpen(false);
                      setSearch("");
                    }}
                    onPreviewFailure={handlePreviewFailure}
                  />
                ))}
              </div>
            )}
          </div>

          {filteredEmojis.length > MAX_VISIBLE_EMOJIS && (
            <p className="border-t border-ghost px-3 py-2 text-meta text-muted">
              showing {MAX_VISIBLE_EMOJIS} of {filteredEmojis.length}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
