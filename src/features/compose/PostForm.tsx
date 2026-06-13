import { useState, useEffect } from "react";
import { UnsignedEvent, Event as NostrEvent, nip19 } from "nostr-tools";
import { useSubmitForm } from "./useSubmit";
import { PostCard } from "../../shared/ui/PostCard";
import { useSettings } from "../../app/settings";
import { timeToGoEst } from "../../shared/utils/timeEstimate";
import { Button } from "../../shared/ui/Button";
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
  const [unsigned, setUnsigned] = useState<UnsignedEvent>({
    kind: 1,
    tags: [["client", "getwired.app"]],
    content: "",
    created_at: Math.floor(Date.now() / 1000),
    pubkey: "",
  });
  const [difficulty, setDifficulty] = useState(String(settings.difficulty));
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollDifficulty, setPollDifficulty] = useState("15");

  useEffect(() => {
    if (refEvent && tagType) {
      unsigned.tags.push(["p", refEvent.pubkey]);
      const addEventTags = () => {
        unsigned.tags = Array.from(
          new Set([...unsigned.tags, ...refEvent.tags.filter((tag) => tag[0] === "e" || tag[0] === "p")]),
        );
        unsigned.tags.push(["e", refEvent.id]);
      };

      switch (tagType) {
        case "Reply":
          addEventTags();
          break;
        case "Quote":
          unsigned.tags.push(["q", refEvent.id]);
          setComment((current) => current + "\nnostr:" + nip19.noteEncode(refEvent.id));
          break;
        default:
          addEventTags();
          break;
      }
    }
  }, [refEvent, tagType]);

  useEffect(() => {
    setDifficulty(String(settings.difficulty));
  }, [settings.difficulty]);

  useEffect(() => {
    setUnsigned((prevUnsigned) => ({
      ...prevUnsigned,
      content: `${comment}`,
      created_at: Math.floor(Date.now() / 1000),
    }));
  }, [comment]);

  useEffect(() => {
    if (pollOptions.some((option) => option !== "")) {
      const generateOptionId = () => Math.random().toString(36).substring(2, 11);

      setUnsigned((prevUnsigned) => ({
        ...prevUnsigned,
        kind: 1068,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ["label", `${comment}`],
          ...pollOptions.map((option) => ["option", generateOptionId(), option]),
          ["relay", "wss://relay.damus.io/"],
          ["relay", "wss://nos.lol"],
          ["PoW", pollDifficulty],
          ["polltype", "singlechoice"],
        ],
      }));
    }
  }, [pollOptions, pollDifficulty, comment]);

  const { handleSubmit: originalHandleSubmit, doingWorkProp, hashrate, bestPow, signedPoWEvent } =
    useSubmitForm(unsigned, difficulty);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (comment.trim() === "") {
      return;
    }

    if (tagType === "Quote" && refEvent) {
      setComment((prevComment) => prevComment + "\nnostr:" + nip19.noteEncode(refEvent.id));
    }

    await originalHandleSubmit(event);

    setPollOptions(["", ""]);
    setComment("");
    setUnsigned({
      kind: 1,
      tags: [["client", "getwired.app"]],
      content: "",
      created_at: Math.floor(Date.now() / 1000),
      pubkey: "",
    });
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
        {doingWorkProp ? (
          <p className="text-meta text-secondary text-right" role="status">
            computing signal… ~{timeToGoEst(difficulty, hashrate)}
            {bestPow > 0 ? ` · pb:${bestPow}` : ""}
          </p>
        ) : null}
        {signedPoWEvent && <PostCard event={signedPoWEvent} replies={[]} />}
      </div>
      <div id="postFormError" className="text-danger text-meta" />
    </form>
  );
}