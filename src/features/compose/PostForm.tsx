import { useState, useEffect, useMemo, useRef } from "react";
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
  const [selectedEmojis, setSelectedEmojis] = useState<CustomEmojiTag[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    willUseWiredAccount,
  } =
    useSubmitForm(unsigned, difficulty);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (comment.trim() === "") {
      return;
    }

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
          value={comment}
          onChange={(e) => {
            setComment(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          rows={comment.split("\n").length || 1}
        />
        {tagType === "Quote" && refEvent && <QuotePreview event={refEvent} />}
        <div className="min-h-14 flex items-center justify-between gap-4 mt-2">
          <SignalStepper
            value={difficulty}
            onChange={setDifficulty}
            min={16}
            active={willUseWiredAccount}
          />
          <div className="flex items-center gap-3">
            <CustomEmojiPicker onSelect={handleEmojiSelect} />
            <Button type="submit" variant="primary" size="sm" disabled={doingWorkProp} loading={doingWorkProp}>
              transmit
            </Button>
          </div>
        </div>
        <PowTransmitStatus
          active={doingWorkProp}
          difficulty={difficulty}
          hashrate={hashrate}
          bestPow={bestPow}
          status={submitStatus}
          className="text-right"
        />
        {submitError && <p className="text-danger text-meta text-right">{submitError}</p>}
        {submitStatus === "published" && acceptedRelays.length > 0 && (
          <p className="text-meta text-secondary text-right">
            posted to {acceptedRelays.length} relay{acceptedRelays.length === 1 ? "" : "s"}
          </p>
        )}
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
