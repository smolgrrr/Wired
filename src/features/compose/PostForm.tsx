import { useState, useEffect, useId, useMemo, useRef } from "react";
import { Event as NostrEvent } from "nostr-tools";
import { useSubmitForm } from "../../shared/hooks/useSubmitForm";
import { buildUnsignedEvent, type CustomEmojiTag } from "./buildUnsignedEvent";
import { PostCard } from "../../shared/ui/PostCard";
import { QuotePreview } from "../../shared/ui/QuotePreview";
import { useSettings } from "../../app/settings";
import { Button } from "../../shared/ui/Button";
import { PowTransmitStatus } from "../../shared/ui/PowTransmitStatus";
import { Textarea } from "../../shared/ui/Textarea";
import { SignalStepper } from "../../shared/ui/SignalStepper";
import { useThreadNavigation } from "../thread/useThreadNavigation";
import { CustomEmojiPicker } from "./CustomEmojiPicker";
import type { CustomEmoji } from "./customEmojiCatalog";

interface PostFormProps {
  refEvent?: NostrEvent;
  tagType?: "Reply" | "Quote" | "";
}

export function PostForm({ refEvent, tagType }: PostFormProps) {
  const { settings } = useSettings();
  const openThread = useThreadNavigation();
  const [comment, setComment] = useState("");
  const [difficulty, setDifficulty] = useState(String(settings.difficulty));
  const [emptySubmitMessage, setEmptySubmitMessage] = useState("");
  const [selectedEmojis, setSelectedEmojis] = useState<CustomEmojiTag[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emptySubmitMessageId = useId();
  const composerLabel = tagType === "Reply" ? "Write a reply" : tagType === "Quote" ? "Add your quote" : "Write a note";

  const activeEmojiTags = useMemo(
    () => selectedEmojis.filter((emoji) => comment.includes(`:${emoji.shortcode}:`)),
    [comment, selectedEmojis],
  );

  const unsigned = useMemo(
    () =>
      buildUnsignedEvent({
        comment,
        refEvent,
        tagType,
        customEmojis: activeEmojiTags,
      }),
    [activeEmojiTags, comment, refEvent, tagType],
  );

  useEffect(() => {
    setDifficulty(String(settings.difficulty));
  }, [settings.difficulty]);

  const {
    handleSubmit: originalHandleSubmit,
    doingWorkProp,
    submitStatus,
    submitError,
    acceptedRelays,
    hashrate,
    bestPow,
    signedPoWEvent,
    powEta,
    willUseWiredAccount,
  } =
    useSubmitForm(unsigned, difficulty);
  const showPowEta = !doingWorkProp && submitStatus !== "published";

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (comment.trim() === "") {
      setEmptySubmitMessage("Write something before transmitting.");
      textareaRef.current?.focus();
      return;
    }

    setEmptySubmitMessage("");
    await originalHandleSubmit(event);
  };

  useEffect(() => {
    if (!signedPoWEvent) return;

    setComment("");
    setSelectedEmojis([]);
  }, [signedPoWEvent]);

  function handleEmojiSelect(emoji: CustomEmoji) {
    const token = `:${emoji.shortcode}:`;
    const textarea = textareaRef.current;
    const selectionStart = textarea?.selectionStart ?? comment.length;
    const selectionEnd = textarea?.selectionEnd ?? comment.length;
    const nextComment = `${comment.slice(0, selectionStart)}${token}${comment.slice(selectionEnd)}`;

    setComment(nextComment);
    setSelectedEmojis((current) => {
      if (current.some((selectedEmoji) => selectedEmoji.shortcode === emoji.shortcode)) {
        return current;
      }

      return [...current, { shortcode: emoji.shortcode, url: emoji.url }];
    });
  }

  return (
    <form name="post" method="post" encType="multipart/form-data" onSubmit={handleSubmit}>
      <input type="hidden" name="MAX_FILE_SIZE" defaultValue={2.5 * 1024 * 1024} />
      <div className="px-2 flex flex-col">
        <Textarea
          ref={textareaRef}
          name="com"
          variant="compose"
          label={composerLabel}
          placeholder="Share a note with the network"
          value={comment}
          aria-invalid={emptySubmitMessage ? true : undefined}
          aria-describedby={emptySubmitMessage ? emptySubmitMessageId : undefined}
          onChange={(e) => {
            setComment(e.target.value);
            if (e.target.value.trim()) {
              setEmptySubmitMessage("");
            }
            e.target.style.height = "auto";
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          rows={comment.split("\n").length || 1}
        />
        {tagType === "Quote" && refEvent && <QuotePreview event={refEvent} />}
        <div className="min-h-14 flex items-start justify-between gap-4 mt-2">
          <div className="flex flex-col items-start gap-1">
            <SignalStepper
              value={difficulty}
              onChange={setDifficulty}
              min={16}
              active={willUseWiredAccount}
            />
            {showPowEta && (
              <p className="text-meta text-secondary">estimated mine time ~{powEta}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <CustomEmojiPicker onSelect={handleEmojiSelect} />
            <Button type="submit" variant="primary" size="sm" disabled={doingWorkProp} loading={doingWorkProp}>
              transmit
            </Button>
          </div>
        </div>
        {emptySubmitMessage && (
          <p id={emptySubmitMessageId} className="text-danger text-meta text-right" role="status">
            {emptySubmitMessage}
          </p>
        )}
        <PowTransmitStatus
          active={doingWorkProp || submitStatus === "published"}
          difficulty={difficulty}
          hashrate={hashrate}
          bestPow={bestPow}
          status={submitStatus}
          acceptedRelayCount={acceptedRelays.length}
          className="text-right"
        />
        {submitError && <p className="text-danger text-meta text-right">{submitError}</p>}
        {signedPoWEvent && (
          <PostCard
            event={signedPoWEvent}
            replies={[]}
            relayHints={acceptedRelays}
            onOpenThread={openThread}
          />
        )}
      </div>
    </form>
  );
}
