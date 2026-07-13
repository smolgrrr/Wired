import { useState, useEffect, useId, useMemo, useRef, useCallback } from "react";
import { Event as NostrEvent, finalizeEvent, generateSecretKey, type EventTemplate } from "nostr-tools";
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
import { MediaUploadPicker } from "./MediaUploadPicker";
import { useMediaUploads } from "./useMediaUploads";

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
  const [composeSecretKey, setComposeSecretKey] = useState(generateSecretKey);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emptySubmitMessageId = useId();
  const composerLabel = tagType === "Reply" ? "Write a reply" : tagType === "Quote" ? "Add your quote" : "Write a note";

  const activeEmojiTags = useMemo(
    () => selectedEmojis.filter((emoji) => comment.includes(`:${emoji.shortcode}:`)),
    [comment, selectedEmojis],
  );
  const signBlossomAuth = useCallback(
    (template: EventTemplate) => finalizeEvent(template, composeSecretKey),
    [composeSecretKey],
  );
  const {
    uploads,
    uploadedMedia,
    hasUploading,
    hasFailed,
    addFiles,
    removeUpload,
    retryUpload,
    clearUploads,
  } = useMediaUploads(signBlossomAuth);

  const unsigned = useMemo(
    () =>
      buildUnsignedEvent({
        comment,
        refEvent,
        tagType,
        customEmojis: activeEmojiTags,
        media: uploadedMedia,
      }),
    [activeEmojiTags, comment, refEvent, tagType, uploadedMedia],
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
    revenueFallbackAvailable,
    handleSubmitWithoutRevenue,
  } =
    useSubmitForm(unsigned, difficulty, {
      secretKey: composeSecretKey,
      onRotateSecretKey: setComposeSecretKey,
      ...(settings.lightningAddress ? { payoutAddress: settings.lightningAddress } : {}),
    });
  const showPowEta = !doingWorkProp && submitStatus !== "published";

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (hasUploading) {
      setEmptySubmitMessage("Wait for media uploads to finish.");
      return;
    }

    if (hasFailed) {
      setEmptySubmitMessage("Remove or retry failed media uploads.");
      return;
    }

    if (comment.trim() === "" && uploadedMedia.length === 0) {
      setEmptySubmitMessage("Write something or attach media before transmitting.");
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
    clearUploads();
  }, [clearUploads, signedPoWEvent]);

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
          labelHidden
          placeholder="write something..."
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
        {uploads.length > 0 && (
          <div className="mt-2">
            <MediaUploadPicker
              uploads={uploads}
              disabled={doingWorkProp}
              showButton={false}
              onAddFiles={addFiles}
              onRemove={removeUpload}
              onRetry={retryUpload}
            />
          </div>
        )}
        <div className="mt-2 flex min-h-20 flex-col gap-2">
          <div className="min-w-0">
            <SignalStepper
              value={difficulty}
              onChange={setDifficulty}
              min={16}
              active={willUseWiredAccount}
              meta={showPowEta ? `ETA ~${powEta}` : undefined}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CustomEmojiPicker onSelect={handleEmojiSelect} />
              <MediaUploadPicker
                uploads={uploads}
                disabled={doingWorkProp}
                showUploads={false}
                onAddFiles={addFiles}
                onRemove={removeUpload}
                onRetry={retryUpload}
              />
            </div>
            <Button type="submit" variant="primary" size="sm" disabled={doingWorkProp || hasUploading} loading={doingWorkProp}>
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
        {revenueFallbackAvailable && (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void handleSubmitWithoutRevenue()}
            >
              transmit without payout
            </Button>
          </div>
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
