import { useState, useEffect } from "react";
import { UnsignedEvent, Event as NostrEvent, nip19 } from "nostr-tools";
import { useSubmitForm } from "./useSubmit";
import "../../styles/Form.css";
import { PostCard } from "../../shared/ui/PostCard";
import { useSettings } from "../../app/settings";
import { timeToGoEst } from "../../shared/utils/timeEstimate";

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
      <div className="px-2 flex flex-col rounded-lg">
        <textarea
          name="com"
          wrap="soft"
          className="shadow-lg w-full px-4 py-3 border-neutral-500 bg-black text-white min-h-20 rounded"
          value={comment}
          onChange={(e) => {
            setComment(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          rows={comment.split("\n").length || 1}
        />
        {pollOptions.some((option) => option !== "") && (
          <div className="flex flex-col items-center gap-2 text-xs">
            <h3 className="text-xs text-neutral-300">Poll Options: </h3>
            <div className="w-full max-w-md space-y-2">
              {pollOptions.map((option, index) => (
                <input
                  key={index}
                  type="text"
                  value={option}
                  placeholder={`Option ${index + 1}`}
                  onChange={(event) =>
                    setPollOptions((current) =>
                      current.map((value, optionIndex) => (optionIndex === index ? event.target.value : value)),
                    )
                  }
                  className="w-full bg-neutral-900 border-neutral-700 rounded"
                />
              ))}
              <label className="flex items-center gap-2 text-neutral-400">
                Minimum vote PoW
                <input
                  type="number"
                  min="10"
                  value={pollDifficulty}
                  onChange={(event) => setPollDifficulty(event.target.value)}
                  className="w-16 bg-neutral-900 border-neutral-700 rounded"
                />
              </label>
            </div>
          </div>
        )}
        <div className="h-14 flex items-center justify-between">
          <div className="inline-flex items-center bg-neutral-800 px-1 py-0.5 rounded-lg">
            <span className="text-xs text-neutral-400">PoW</span>
            <input
              type="number"
              className="bg-neutral-800 text-white text-xs font-medium border-none rounded-lg w-10"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              min="16"
            />
            <button type="button" onClick={() => setDifficulty(String(Math.max(10, parseInt(difficulty) - 1)))}>
              -
            </button>
            <button type="button" className="pl-0.5" onClick={() => setDifficulty(String(parseInt(difficulty) + 1))}>
              +
            </button>
          </div>
          <div>
            <div className="flex items-center gap-4">
              <button
                type="button"
                className="text-xs text-neutral-400"
                onClick={() => setPollOptions(pollOptions.some(Boolean) ? ["", ""] : ["Option 1", "Option 2"])}
              >
                {pollOptions.some(Boolean) ? "Remove poll" : "Add poll"}
              </button>
              <button
                type="submit"
                className={`bg-black border h-9 inline-flex items-center justify-center px-4 rounded-lg text-white font-medium text-sm ${
                  doingWorkProp ? "cursor-not-allowed" : ""
                }`}
                disabled={doingWorkProp}
              >
                Submit
              </button>
            </div>
          </div>
        </div>
        {doingWorkProp ? (
          <div className="flex animate-pulse text-xs text-gray-300">
            <span className="ml-auto">Doing Work:</span>
            {hashrate && <span>{hashrate > 100000 ? `${(hashrate / 1000).toFixed(0)}k` : hashrate}</span>}H/s
            <span className="pl-1"> (PB:{bestPow},</span>
            <div className="text-xs text-gray-300 pl-1">~{timeToGoEst(difficulty, hashrate)} total</div>)
          </div>
        ) : null}
        {signedPoWEvent && <PostCard event={signedPoWEvent} replies={[]} />}
      </div>
      <div id="postFormError" className="text-red-500" />
    </form>
  );
}