import { useEffect, useMemo, useRef, useState } from "react";
import { SmilePlus } from "lucide-react";
import { Button } from "../../shared/ui/Button";
import { Input } from "../../shared/ui/Input";

export type CustomEmoji = {
  shortcode: string;
  static_url: string;
  tags: string[];
  url: string;
  visible_in_picker: boolean;
};

type LoadState = "idle" | "loading" | "ready" | "error";

type EmojiGroup = {
  label: string;
  matches: (shortcode: string) => boolean;
};

const EMOJI_GROUPS: EmojiGroup[] = [
  { label: "0-9", matches: (shortcode) => /^[0-9]/.test(shortcode) },
  { label: "A-E", matches: (shortcode) => /^[a-e]/i.test(shortcode) },
  { label: "F-J", matches: (shortcode) => /^[f-j]/i.test(shortcode) },
  { label: "K-N", matches: (shortcode) => /^[k-n]/i.test(shortcode) },
  { label: "O-R", matches: (shortcode) => /^[o-r]/i.test(shortcode) },
  { label: "S-V", matches: (shortcode) => /^[s-v]/i.test(shortcode) },
  { label: "W-Z", matches: (shortcode) => /^[w-z]/i.test(shortcode) },
];

const MAX_VISIBLE_EMOJIS = 120;

type CustomEmojiPickerProps = {
  onSelect: (emoji: CustomEmoji) => void;
};

function sortEmojis(emojis: CustomEmoji[]) {
  return [...emojis].sort((left, right) => left.shortcode.localeCompare(right.shortcode));
}

export function CustomEmojiPicker({ onSelect }: CustomEmojiPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [emojis, setEmojis] = useState<CustomEmoji[]>([]);
  const [search, setSearch] = useState("");
  const [activeGroup, setActiveGroup] = useState(1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || loadState !== "idle") return;

    let cancelled = false;
    setLoadState("loading");

    void fetch(`${import.meta.env.BASE_URL}custom_emojis.json`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to load custom emoji catalog");
        }

        return response.json() as Promise<CustomEmoji[]>;
      })
      .then((catalog) => {
        if (cancelled) return;

        const visibleEmojis = catalog.filter(
          (emoji) => emoji.visible_in_picker && emoji.shortcode && emoji.url,
        );
        setEmojis(sortEmojis(visibleEmojis));
        setLoadState("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setLoadState("error");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, loadState]);

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
    const group = EMOJI_GROUPS[activeGroup] ?? EMOJI_GROUPS[0];

    return emojis.filter((emoji) => {
      if (query) {
        return (
          emoji.shortcode.toLowerCase().includes(query) ||
          emoji.tags.some((tag) => tag.toLowerCase().includes(query))
        );
      }

      return group.matches(emoji.shortcode);
    });
  }, [activeGroup, emojis, search]);

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
        <div className="absolute bottom-full right-0 z-50 mb-2 w-[min(22rem,calc(100vw-2rem))] rounded-sm border border-ghost bg-surface-raised shadow-2xl">
          <div className="border-b border-ghost p-2">
            <Input
              type="search"
              placeholder="search emotes"
              value={search}
              autoFocus
              onChange={(event) => setSearch(event.target.value)}
              className="min-h-[32px]"
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

          <div className="h-64 overflow-y-auto p-2">
            {loadState === "loading" && (
              <p className="px-2 py-8 text-center text-meta text-secondary">loading emotes</p>
            )}

            {loadState === "error" && (
              <p className="px-2 py-8 text-center text-meta text-danger">emotes failed to load</p>
            )}

            {loadState === "ready" && visibleEmojis.length === 0 && (
              <p className="px-2 py-8 text-center text-meta text-secondary">no emotes found</p>
            )}

            {visibleEmojis.length > 0 && (
              <div className="grid grid-cols-8 gap-1">
                {visibleEmojis.map((emoji) => (
                  <button
                    key={`${emoji.shortcode}-${emoji.url}`}
                    type="button"
                    title={`:${emoji.shortcode}:`}
                    aria-label={`insert ${emoji.shortcode}`}
                    className="flex aspect-square items-center justify-center rounded-sm border border-transparent p-1 hover:border-signal/30 hover:bg-signal-ghost focus-visible:border-signal"
                    onClick={() => {
                      onSelect(emoji);
                      setIsOpen(false);
                      setSearch("");
                    }}
                  >
                    <img
                      src={emoji.static_url || emoji.url}
                      alt=""
                      loading="lazy"
                      className="max-h-full max-w-full object-contain"
                    />
                  </button>
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
