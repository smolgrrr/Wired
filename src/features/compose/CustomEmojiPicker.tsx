import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SmilePlus, X } from "lucide-react";
import { getEmojiPickerDisplayUrls } from "@lib/customEmoji";
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
const FAILED_EMOJI_STORAGE_KEY = "wired.failedCustomEmojis";
const LEGACY_FAILED_EMOJI_STORAGE_KEY = "wired.failedCustomEmojiPreviewUrls";
const MAX_STORED_FAILED_EMOJIS = 2000;

type CustomEmojiPickerProps = {
  onSelect: (emoji: CustomEmoji) => void;
};

type EmojiButtonProps = {
  emoji: CustomEmoji;
  onSelect: () => void;
  onPreviewFailure: (emoji: CustomEmoji) => void;
};

export function emojiFailureKey(emoji: CustomEmoji): string {
  return `${emoji.shortcode}:${emoji.url}`;
}

function loadFailedEmojiKeys() {
  if (typeof window === "undefined") return new Set<string>();

  try {
    const storedKeys = JSON.parse(
      window.localStorage.getItem(FAILED_EMOJI_STORAGE_KEY) ?? "[]",
    ) as unknown;

    if (!Array.isArray(storedKeys)) {
      return new Set<string>();
    }

    return new Set(storedKeys.filter((key): key is string => typeof key === "string"));
  } catch {
    return new Set<string>();
  }
}

function storeFailedEmojiKeys(keys: Set<string>) {
  if (typeof window === "undefined") return;

  const compactKeys = Array.from(keys).slice(-MAX_STORED_FAILED_EMOJIS);
  window.localStorage.setItem(FAILED_EMOJI_STORAGE_KEY, JSON.stringify(compactKeys));
  window.localStorage.removeItem(LEGACY_FAILED_EMOJI_STORAGE_KEY);
}

function EmojiButton({ emoji, onSelect, onPreviewFailure }: EmojiButtonProps) {
  const displayUrls = getEmojiPickerDisplayUrls(emoji.previewUrl, emoji.url);
  const [displayUrlIndex, setDisplayUrlIndex] = useState(0);
  const [isHidden, setIsHidden] = useState(false);
  const displayUrl = displayUrls[displayUrlIndex];

  const failPreview = useCallback(() => {
    setIsHidden(true);
    onPreviewFailure(emoji);
  }, [emoji, onPreviewFailure]);

  const tryNextUrl = useCallback(() => {
    if (displayUrlIndex + 1 < displayUrls.length) {
      setDisplayUrlIndex((current) => current + 1);
      return;
    }

    failPreview();
  }, [displayUrlIndex, displayUrls.length, failPreview]);

  if (isHidden || !displayUrl) {
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
        onLoad={(event) => {
          const image = event.currentTarget;

          if (image.naturalWidth === 0 || image.naturalHeight === 0) {
            tryNextUrl();
          }
        }}
        onError={tryNextUrl}
      />
    </button>
  );
}

export function CustomEmojiPicker({ onSelect }: CustomEmojiPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeGroup, setActiveGroup] = useState(0);
  const [catalogState, setCatalogState] = useState(getCustomEmojiCatalogState);
  const [failedEmojiKeys, setFailedEmojiKeys] = useState(loadFailedEmojiKeys);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

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

  const closePicker = useCallback(() => {
    setIsOpen(false);
  }, []);

  const getTriggerButton = useCallback(
    () =>
      wrapperRef.current?.querySelector<HTMLButtonElement>("[data-custom-emoji-trigger]") ??
      null,
    [],
  );

  const openPicker = useCallback(() => {
    const activeElement = document.activeElement;

    previouslyFocusedRef.current =
      activeElement instanceof HTMLElement && activeElement !== document.body
        ? activeElement
        : getTriggerButton();
    setIsOpen(true);
  }, [getTriggerButton]);

  const togglePicker = useCallback(() => {
    if (isOpen) {
      closePicker();
      return;
    }

    openPicker();
  }, [closePicker, isOpen, openPicker]);

  useEffect(() => {
    if (!isOpen) {
      if (!wasOpenRef.current) return;

      wasOpenRef.current = false;
      const focusTarget = previouslyFocusedRef.current?.isConnected
        ? previouslyFocusedRef.current
        : getTriggerButton();

      focusTarget?.focus();
      previouslyFocusedRef.current = null;
      return;
    }

    wasOpenRef.current = true;

    const focusSearch = () => {
      panelRef.current?.querySelector<HTMLInputElement>("input[type='search']")?.focus();
    };

    if (typeof window.requestAnimationFrame === "function") {
      const frame = window.requestAnimationFrame(focusSearch);
      return () => window.cancelAnimationFrame(frame);
    }

    const timeout = window.setTimeout(focusSearch, 0);
    return () => window.clearTimeout(timeout);
  }, [getTriggerButton, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (wrapperRef.current?.contains(event.target as Node)) return;
      closePicker();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closePicker();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closePicker, isOpen]);

  const filteredEmojis = useMemo(() => {
    const query = search.trim().toLowerCase();

    return filterCustomEmojis(catalogState.emojis, query, activeGroup).filter(
      (emoji) => !failedEmojiKeys.has(emojiFailureKey(emoji)),
    );
  }, [activeGroup, catalogState.emojis, failedEmojiKeys, search]);

  function handlePreviewFailure(emoji: CustomEmoji) {
    const key = emojiFailureKey(emoji);

    setFailedEmojiKeys((current) => {
      if (current.has(key)) {
        return current;
      }

      const next = new Set(current);
      next.add(key);
      storeFailedEmojiKeys(next);
      return next;
    });
  }

  const visibleEmojis = filteredEmojis.slice(0, MAX_VISIBLE_EMOJIS);
  const trimmedSearch = search.trim();
  const isCatalogLoading = catalogState.status === "idle" || catalogState.status === "loading";
  const emptyState =
    catalogState.status === "error"
      ? {
          title: "Emotes could not load",
          description: "Close the picker and try again in a moment.",
        }
      : isCatalogLoading
        ? {
            title: "Loading emotes",
            description: "Preparing the custom emote catalog.",
          }
        : trimmedSearch
          ? {
              title: "No matches",
              description: `No custom emotes match "${trimmedSearch}".`,
            }
          : {
              title: "No emotes in this group",
              description: "Try another range or search by shortcode.",
            };

  return (
    <div ref={wrapperRef} className="relative">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        data-custom-emoji-trigger="true"
        aria-label="open custom emoji picker"
        aria-expanded={isOpen}
        title="custom emoji"
        className="px-2"
        onClick={togglePicker}
      >
        <SmilePlus className="h-4 w-4" aria-hidden="true" />
      </Button>

      {isOpen && (
        <>
          <div
            aria-hidden="true"
            className="fixed inset-0 z-40 bg-void/60 backdrop-blur-sm animate-fade-in motion-reduce:animate-none sm:hidden"
            onPointerDown={closePicker}
          />

          <div
            ref={panelRef}
            role="dialog"
            aria-label="custom emote picker"
            className={[
              "z-50 flex flex-col overflow-hidden border border-ghost bg-surface-raised shadow-2xl",
              "fixed inset-x-0 bottom-0 max-h-[min(32rem,calc(100dvh-1rem))] rounded-t-sm",
              "animate-[slideUp_220ms_var(--ease-out)] motion-reduce:animate-none",
              "sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-2 sm:max-h-[min(24rem,calc(100dvh-6rem))] sm:w-[24rem] sm:rounded-sm sm:animate-fade-in",
            ].join(" ")}
          >
            <div className="flex items-center justify-between gap-3 border-b border-ghost px-3 py-2 sm:hidden">
              <h2 className="text-body font-medium text-primary">Custom emotes</h2>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="close custom emoji picker"
                className="h-8 w-8 p-0"
                onClick={closePicker}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>

            <div className="border-b border-ghost p-2">
              <Input
                type="search"
                aria-label="search custom emotes"
                placeholder="search emotes"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="min-h-[36px] text-[16px]"
              />
            </div>

            {!trimmedSearch && (
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

            <div className="min-h-40 flex-1 overflow-y-auto p-2 sm:h-64 sm:flex-none">
              {visibleEmojis.length === 0 && (
                <div
                  role={isCatalogLoading ? "status" : undefined}
                  className="flex min-h-40 flex-col items-center justify-center gap-4 px-4 py-8 text-center"
                >
                  {isCatalogLoading && (
                    <div
                      aria-hidden="true"
                      className="grid w-full max-w-56 grid-cols-8 gap-1 motion-safe:animate-pulse motion-reduce:animate-none"
                    >
                      {Array.from({ length: 24 }, (_, index) => (
                        <div
                          key={index}
                          className="aspect-square rounded-sm border border-ghost bg-surface"
                        />
                      ))}
                    </div>
                  )}
                  <div>
                    <p className="text-body text-primary">{emptyState.title}</p>
                    <p className="mt-1 text-meta text-secondary">{emptyState.description}</p>
                  </div>
                </div>
              )}

              {visibleEmojis.length > 0 && (
                <div className="grid grid-cols-8 gap-1">
                  {visibleEmojis.map((emoji) => (
                    <EmojiButton
                      key={`${emoji.shortcode}-${emoji.url}`}
                      emoji={emoji}
                      onSelect={() => {
                        onSelect(emoji);
                        setSearch("");
                        closePicker();
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
        </>
      )}
    </div>
  );
}
