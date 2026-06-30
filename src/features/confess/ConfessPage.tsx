import { useCallback, useEffect, useMemo, useState } from "react";
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  nip19,
  type Event,
  type UnsignedEvent,
} from "nostr-tools";
import { ContentColumn, PageShell } from "../../shared/ui/PageShell";
import { Button } from "../../shared/ui/Button";
import { PowTransmitStatus } from "../../shared/ui/PowTransmitStatus";
import { Textarea } from "../../shared/ui/Textarea";
import { PostCard } from "../../shared/ui/PostCard";
import { usePowMining } from "../../shared/hooks/usePowMining";
import {
  fetchConfessStatus,
  submitConfession,
  type ConfessStatus,
  type ConfessSubmitResponse,
} from "./api";

const EMPTY_STATUS: ConfessStatus = {
  configured: false,
  day: "",
  count: 0,
  limit: 6,
  remaining: 0,
  minimumPow: 16,
  closed: true,
  nextResetAt: "",
};

type ConfessSubmitStatus =
  | "idle"
  | "loading"
  | "mining"
  | "submitting"
  | "published"
  | "failed";

const disallowedContentPattern =
  /\b(?:(?:https?|wss?|ftp|ipfs):\/\/|(?:magnet|nostr):|www\.)[^\s<>"')\]]+|\b[a-z0-9.-]+\.(?:app|band|biz|blog|cloud|co|com|dev|fm|gg|info|io|is|land|link|lol|me|media|net|news|online|onion|org|site|social|to|tv|wine|xyz)(?:\/[^\s<>"')\]]*)?|\b[^\s<>"')\]]+\.(?:avif|gif|jpe?g|m4a|mov|mp3|mp4|ogg|png|svg|wav|webm|webp)(?:\?[^\s<>"')\]]*)?/i;

function hasDisallowedContent(content: string): boolean {
  return disallowedContentPattern.test(content);
}

function buildAdmissionEvent(content: string, pubkey: string): UnsignedEvent {
  return {
    kind: 1,
    tags: [
      ["client", "wired-confess"],
      ["t", "confess"],
    ],
    content,
    created_at: Math.floor(Date.now() / 1000),
    pubkey,
  };
}

export default function ConfessPage() {
  const [comment, setComment] = useState("");
  const [secretKey, setSecretKey] = useState(() => generateSecretKey());
  const [status, setStatus] = useState<ConfessStatus>(EMPTY_STATUS);
  const [submitStatus, setSubmitStatus] = useState<ConfessSubmitStatus>("loading");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [posted, setPosted] = useState<ConfessSubmitResponse | null>(null);
  const [minedEvent, setMinedEvent] = useState<UnsignedEvent>();

  const difficulty = String(status.minimumPow);
  const contentError = hasDisallowedContent(comment)
    ? "links and media are not allowed"
    : null;
  const pubkey = useMemo(() => getPublicKey(secretKey), [secretKey]);
  const unsigned = useMemo(
    () => buildAdmissionEvent(comment.trim(), pubkey),
    [comment, pubkey],
  );
  const {
    startWork,
    messageFromWorker,
    hashrate,
    bestPow,
  } = usePowMining(navigator.hardwareConcurrency || 4, unsigned, difficulty);

  const loadStatus = useCallback(async () => {
    try {
      const nextStatus = await fetchConfessStatus();
      setStatus(nextStatus);
      setSubmitStatus((current) => (current === "loading" ? "idle" : current));
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "status unavailable");
      setSubmitStatus("failed");
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (messageFromWorker && submitStatus === "mining") {
      setMinedEvent(messageFromWorker);
    }
  }, [messageFromWorker, submitStatus]);

  useEffect(() => {
    if (!minedEvent) return;

    let cancelled = false;

    const publishConfession = async () => {
      setSubmitStatus("submitting");
      setSubmitError(null);

      try {
        const admissionEvent = finalizeEvent(minedEvent, secretKey) as Event;
        const result = await submitConfession(admissionEvent);
        if (cancelled) return;

        setPosted(result);
        setComment("");
        setSecretKey(generateSecretKey());
        setStatus((current) => ({
          ...current,
          count: result.count,
          remaining: result.remaining,
          minimumPow: result.minimumPow,
          closed: result.remaining <= 0,
          nextResetAt: result.nextResetAt,
        }));
        setSubmitStatus("published");
      } catch (error) {
        if (cancelled) return;
        setSubmitError(error instanceof Error ? error.message : "confess failed");
        setSubmitStatus("failed");
        void loadStatus();
      } finally {
        if (!cancelled) {
          setMinedEvent(undefined);
        }
      }
    };

    void publishConfession();

    return () => {
      cancelled = true;
    };
  }, [loadStatus, minedEvent, secretKey]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setPosted(null);
    setSubmitError(null);

    if (!comment.trim() || contentError || status.closed || !status.configured) return;

    setSubmitStatus("mining");
    startWork();
  };

  const doingWork = submitStatus === "mining" || submitStatus === "submitting";
  const isUnavailable = !status.configured || status.closed || submitStatus === "loading";
  const noteLink = posted ? nip19.noteEncode(posted.event.id) : "";

  return (
    <PageShell>
      <ContentColumn className="pt-6">
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex items-center justify-between gap-4 border-b border-ghost pb-3">
            <div>
              <h1 className="text-display font-medium">confess</h1>
              <p className="text-meta text-secondary">
                minimum signal {status.minimumPow} · {status.remaining}/{status.limit} today
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void loadStatus()}
              disabled={doingWork}
            >
              refresh
            </Button>
          </div>

          <Textarea
            name="confession"
            variant="compose"
            value={comment}
            onChange={(event) => {
              setComment(event.target.value);
              event.target.style.height = "auto";
              event.target.style.height = `${event.target.scrollHeight}px`;
            }}
            rows={Math.max(4, comment.split("\n").length)}
            maxLength={2000}
            required
            disabled={doingWork || isUnavailable}
            aria-invalid={contentError ? true : undefined}
          />

          <div className="flex min-h-14 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-meta text-secondary">
              {status.closed
                ? "daily cap reached"
                : status.configured
                  ? `server will accept signal ${status.minimumPow}+`
                  : "confess account is not configured"}
            </p>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={doingWork || isUnavailable || !comment.trim() || Boolean(contentError)}
              loading={doingWork}
            >
              post
            </Button>
          </div>

          <PowTransmitStatus
            active={submitStatus === "mining"}
            difficulty={difficulty}
            hashrate={hashrate}
            bestPow={bestPow}
            status="mining"
            className="text-right"
          />
          {submitStatus === "submitting" && (
            <p className="text-meta text-secondary text-right" role="status">
              submitting to wired backend...
            </p>
          )}

          {submitError && <p className="text-meta text-danger text-right">{submitError}</p>}
          {contentError && !submitError && (
            <p className="text-meta text-danger text-right">{contentError}</p>
          )}
          {posted && (
            <p className="text-meta text-secondary text-right">
              posted to {posted.acceptedRelays.length} relay
              {posted.acceptedRelays.length === 1 ? "" : "s"} · {noteLink}
            </p>
          )}
        </form>

        {posted && <PostCard event={posted.event} replies={[]} />}
      </ContentColumn>
    </PageShell>
  );
}
