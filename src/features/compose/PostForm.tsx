import { useState, useEffect, useMemo } from "react";
import { Event as NostrEvent } from "nostr-tools";
import { useSubmitForm } from "../../shared/hooks/useSubmitForm";
import { buildUnsignedEvent } from "./buildUnsignedEvent";
import { PostCard } from "../../shared/ui/PostCard";
import { QuotePreview } from "../../shared/ui/QuotePreview";
import { useSettings } from "../../app/settings";
import { Button } from "../../shared/ui/Button";
import { PowTransmitStatus } from "../../shared/ui/PowTransmitStatus";
import { Input } from "../../shared/ui/Input";
import { Textarea } from "../../shared/ui/Textarea";
import { SignalStepper } from "../../shared/ui/SignalStepper";

interface PostFormProps {
  refEvent?: NostrEvent;
  tagType?: "Reply" | "Quote" | "";
}

export function PostForm({ refEvent, tagType }: PostFormProps) {
  const { settings } = useSettings();
  const [comment, setComment] = useState("");
  const [difficulty, setDifficulty] = useState(String(settings.difficulty));
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollDifficulty, setPollDifficulty] = useState("15");

  const unsigned = useMemo(
    () =>
      buildUnsignedEvent({
        comment,
        refEvent,
        tagType,
        pollOptions,
        pollDifficulty,
      }),
    [comment, refEvent, tagType, pollOptions, pollDifficulty],
  );

  useEffect(() => {
    setDifficulty(String(settings.difficulty));
  }, [settings.difficulty]);

  const { handleSubmit: originalHandleSubmit, doingWorkProp, hashrate, bestPow, signedPoWEvent } =
    useSubmitForm(unsigned, difficulty);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (comment.trim() === "") {
      return;
    }

    await originalHandleSubmit(event);

    setPollOptions(["", ""]);
    setComment("");
  };

  return (
    <form name="post" method="post" encType="multipart/form-data" onSubmit={handleSubmit}>
      <input type="hidden" name="MAX_FILE_SIZE" defaultValue={2.5 * 1024 * 1024} />
      <div className="px-2 flex flex-col">
        <Textarea
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
        {pollOptions.some((option) => option !== "") && (
          <div className="flex flex-col gap-3 mt-3">
            <p className="text-meta text-secondary">poll options</p>
            <div className="flex flex-col gap-2 max-w-md">
              {pollOptions.map((option, index) => (
                <Input
                  key={index}
                  type="text"
                  value={option}
                  placeholder={`option ${index + 1}`}
                  onChange={(event) =>
                    setPollOptions((current) =>
                      current.map((value, optionIndex) => (optionIndex === index ? event.target.value : value)),
                    )
                  }
                />
              ))}
              <Input
                id={`poll-signal-${refEvent?.id ?? "feed"}`}
                label="minimum vote signal"
                type="number"
                min={10}
                value={pollDifficulty}
                onChange={(event) => setPollDifficulty(event.target.value)}
                containerClassName="max-w-[12rem]"
              />
            </div>
          </div>
        )}
        <div className="min-h-14 flex items-center justify-between gap-4 mt-2">
          <SignalStepper value={difficulty} onChange={setDifficulty} min={16} />
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setPollOptions(pollOptions.some(Boolean) ? ["", ""] : ["Option 1", "Option 2"])}
            >
              {pollOptions.some(Boolean) ? "remove poll" : "add poll"}
            </Button>
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
          className="text-right"
        />
        {signedPoWEvent && <PostCard event={signedPoWEvent} replies={[]} />}
      </div>
      <div id="postFormError" className="text-danger text-meta" />
    </form>
  );
}