import {
  Check,
  Copy,
  Radio,
  Share2,
  X as CloseIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { buildThreadPath, encodeThreadRef } from "@lib/threadRefs";

type ShareControlProps = {
  eventId: string;
  relayHints?: readonly string[];
  excerpt?: string;
};

const FEEDBACK_DURATION_MS = 2_000;

function canonicalThreadUrl(eventId: string, relayHints: readonly string[]): string {
  return new URL(buildThreadPath(eventId, relayHints), window.location.origin).toString();
}

function legacyCopy(text: string): boolean {
  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();

  try {
    return document.execCommand("copy");
  } finally {
    input.remove();
  }
}

async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Some browsers expose the Clipboard API but reject it outside a secure context.
    }
  }

  return legacyCopy(text);
}

export function ShareControl({
  eventId,
  relayHints = [],
  excerpt,
}: ShareControlProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const [statusContext, setStatusContext] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>();

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    wrapperRef.current?.querySelector<HTMLButtonElement>("[data-share-trigger]")?.focus();
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const frame = window.requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
    });

    function handlePointerDown(event: PointerEvent) {
      if (wrapperRef.current?.contains(event.target as Node)) return;
      closeMenu();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeMenu();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeMenu, isOpen]);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const showStatus = useCallback(
    (nextStatus: "copied" | "error", context = "") => {
      setStatus(nextStatus);
      setStatusContext(context);
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => {
        setStatus("idle");
        setStatusContext("");
      }, FEEDBACK_DURATION_MS);
    },
    [],
  );

  const url = canonicalThreadUrl(eventId, relayHints);
  const xIntentUrl = new URL("https://twitter.com/intent/tweet");
  xIntentUrl.searchParams.set(
    "text",
    `${excerpt?.trim().slice(0, 180) || "Wired signal"}\n${url}`,
  );

  const copyFor = useCallback(
    async (destination: string) => {
      showStatus((await copyText(url)) ? "copied" : "error", destination);
    },
    [showStatus, url],
  );

  const handleMore = useCallback(async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Wired signal",
          text: excerpt?.trim().slice(0, 180) || undefined,
          url,
        });
        closeMenu();
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          closeMenu();
          return;
        }
      }
    }

    showStatus((await copyText(url)) ? "copied" : "error");
  }, [closeMenu, excerpt, showStatus, url]);

  const menuItemClass =
    "wired-pressable flex min-h-11 w-full items-center gap-3 rounded-sm px-3 py-2 text-left text-meta text-secondary hover:bg-signal-ghost hover:text-primary focus-visible:bg-signal-ghost focus-visible:text-primary";

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        data-share-trigger="true"
        onClick={() => setIsOpen((open) => !open)}
        className="wired-touch-target wired-pressable inline-flex min-h-[24px] min-w-[24px] items-center gap-1 rounded-sm text-secondary transition-colors duration-hover hover:text-primary focus-visible:outline-none"
        aria-label="Share this thread"
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        <Share2 aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.8} />
        <span>share</span>
      </button>

      {isOpen && (
        <>
          <div
            aria-hidden="true"
            className="fixed inset-0 z-40 bg-void/60 backdrop-blur-sm animate-fade-in motion-reduce:animate-none sm:hidden"
            onPointerDown={closeMenu}
          />
          <div
            ref={panelRef}
            role="menu"
            aria-label="Share this thread"
            className={[
              "z-50 overflow-hidden border border-ghost bg-surface-raised shadow-2xl",
              "fixed inset-x-0 bottom-0 rounded-t-sm p-2",
              "animate-[slideUp_180ms_var(--ease-out)] motion-reduce:animate-none",
              "sm:absolute sm:inset-x-auto sm:bottom-full sm:right-0 sm:mb-2 sm:w-56 sm:rounded-sm sm:animate-fade-in",
            ].join(" ")}
          >
            <div className="mb-1 flex items-center justify-between px-3 py-2 sm:hidden">
              <span className="text-body font-medium text-primary">Share signal</span>
              <button
                type="button"
                aria-label="Close share menu"
                className="wired-touch-target wired-pressable inline-flex h-8 w-8 items-center justify-center rounded-sm text-secondary hover:text-primary"
                onClick={closeMenu}
              >
                <CloseIcon aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>

            <a
              href={xIntentUrl.toString()}
              target="_blank"
              rel="noreferrer"
              role="menuitem"
              className={menuItemClass}
              onClick={closeMenu}
            >
              <span aria-hidden="true" className="w-4 text-center text-body">X</span>
              <span>Share to X</span>
            </a>
            <a
              href={`nostr:${encodeThreadRef(eventId, relayHints)}`}
              role="menuitem"
              className={menuItemClass}
              onClick={closeMenu}
            >
              <Radio aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
              <span>Share to Nostr</span>
            </a>
            <button
              type="button"
              role="menuitem"
              className={menuItemClass}
              onClick={() => void copyFor("")}
            >
              <Copy aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
              <span>Copy link</span>
            </button>
            <div className="my-1 h-px bg-[var(--border-ghost)]" />
            <button
              type="button"
              role="menuitem"
              className={menuItemClass}
              onClick={handleMore}
            >
              <Share2 aria-hidden="true" className="h-4 w-4" strokeWidth={1.8} />
              <span>More options</span>
            </button>

            {status !== "idle" && (
              <div
                className={[
                  "mx-3 mt-1 flex items-center gap-2 border-t border-ghost pt-2 text-micro",
                  status === "copied" ? "text-signal" : "text-danger",
                ].join(" ")}
                role="status"
              >
                {status === "copied" && <Check aria-hidden="true" className="h-3.5 w-3.5" />}
                <span>
                  {status === "copied"
                    ? `link copied${statusContext ? ` for ${statusContext}` : ""}`
                    : "copy failed"}
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
