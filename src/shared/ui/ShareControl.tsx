import { Check, MessageCircle, Share2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { buildThreadPath } from "@lib/threadRefs";

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
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const showStatus = useCallback((nextStatus: "copied" | "error") => {
    setStatus(nextStatus);
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setStatus("idle"), FEEDBACK_DURATION_MS);
  }, []);

  const handleShare = useCallback(async () => {
    const url = canonicalThreadUrl(eventId, relayHints);

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Wired signal",
          text: excerpt?.trim().slice(0, 180) || undefined,
          url,
        });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    showStatus((await copyText(url)) ? "copied" : "error");
  }, [eventId, excerpt, relayHints, showStatus]);

  const handleDiscord = useCallback(async () => {
    const url = canonicalThreadUrl(eventId, relayHints);
    showStatus((await copyText(url)) ? "copied" : "error");
  }, [eventId, relayHints, showStatus]);

  const url = canonicalThreadUrl(eventId, relayHints);
  const xIntentUrl = new URL("https://x.com/intent/post");
  xIntentUrl.searchParams.set(
    "text",
    `${excerpt?.trim().slice(0, 180) || "Wired signal"}\n${url}`,
  );
  const statusLabel = status === "copied" ? "link copied" : "copy failed";

  return (
    <div className="flex items-center gap-3" aria-label="Share this thread">
      <a
        href={xIntentUrl.toString()}
        target="_blank"
        rel="noreferrer"
        className="wired-touch-target wired-pressable inline-flex min-h-[24px] min-w-[24px] items-center rounded-sm text-secondary transition-colors duration-hover hover:text-primary focus-visible:outline-none"
        aria-label="Share this thread on X"
      >
        X
      </a>
      <button
        type="button"
        onClick={handleDiscord}
        className="wired-touch-target wired-pressable inline-flex min-h-[24px] min-w-[24px] items-center gap-1 rounded-sm text-secondary transition-colors duration-hover hover:text-primary focus-visible:outline-none"
        aria-label="Copy this thread link for Discord"
      >
        <MessageCircle aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.8} />
        <span>Discord</span>
      </button>
      <button
        type="button"
        onClick={handleShare}
        className="wired-touch-target wired-pressable inline-flex min-h-[24px] min-w-[24px] items-center gap-1 rounded-sm text-secondary transition-colors duration-hover hover:text-primary focus-visible:outline-none"
        aria-label="More sharing options"
      >
        <Share2 aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.8} />
        <span>more</span>
      </button>
      {status !== "idle" && (
        <span className="inline-flex items-center gap-1 text-signal" aria-live="polite">
          {status === "copied" && <Check aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.8} />}
          {statusLabel}
        </span>
      )}
    </div>
  );
}
