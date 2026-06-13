import { useState, useEffect } from "react";
import { Event, UnsignedEvent } from "nostr-tools";
import { subPoll } from "../../nostr/subscriptions";
import { verifyPow } from "../../shared/pow/core";
import { timeToGoEst } from "../../shared/utils/timeEstimate";
import { uniqBy } from "../../utils/otherUtils";
import { useSubmitForm } from "../../features/compose/useSubmit";

export function PollResponder({ eventdata }: { eventdata: Event }) {
  const [options, setOptions] = useState<[string, string][]>([]);
  const [difficulty, setDifficulty] = useState("0");
  const [minDiff, setMinDiff] = useState("0");
  const [showResults, setShowResults] = useState(false);
  const [voteEvents, setVoteEvents] = useState<Event[]>([]);
  const [unsigned, setUnsigned] = useState<UnsignedEvent>({
    kind: 1018,
    tags: [["client", "getwired.app"], ["e", eventdata.id]],
    content: "",
    created_at: Math.floor(Date.now() / 1000),
    pubkey: "",
  });
  const [selectedOption, setSelectedOption] = useState<string>("");

  useEffect(() => {
    if (eventdata.kind === 1068) {
      const uniqueOptions = new Map<string, string>();
      eventdata.tags.forEach((tag) => {
        if (tag[0] === "option") {
          uniqueOptions.set(tag[1], tag[2]);
        }
      });
      setOptions(Array.from(uniqueOptions.entries()));
    }

    const pollMinDiff = eventdata.tags.find((t) => t[0] === "PoW")?.[1] || "0";
    if (pollMinDiff !== "0") {
      setDifficulty(pollMinDiff);
      setMinDiff(pollMinDiff);
    }

    if (!showResults) return;

    const onEvent = (event: Event) => {
      setVoteEvents((prevEvents) => [...prevEvents, event]);
    };

    const subscription = subPoll(eventdata.id, onEvent);
    return () => subscription.close();
  }, [showResults, eventdata]);

  const uniqVoteEvents = uniqBy(voteEvents, "id");
  const sortedVoteEvents = uniqVoteEvents.map((event) => {
    const pow = verifyPow(event);
    const responseTag = event.tags.find((tag) => tag[0] === "response");
    const optionLabel = options.find((option) => option[0] === responseTag?.[1])?.[1] || "Unknown";
    return { voteResponse: pow, optionLabel };
  });

  const { handleSubmit: originalHandleSubmit, doingWorkProp, hashrate, bestPow } =
    useSubmitForm(unsigned, difficulty);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    unsigned.tags.push(["response", selectedOption]);
    await originalHandleSubmit(event);

    setUnsigned((prevUnsigned) => ({
      ...prevUnsigned,
      content: "",
      created_at: Math.floor(Date.now() / 1000),
      tags: [["client", "getwired.app"], ["e", eventdata.id]],
    }));
  };

  return (
    <form name="post" method="post" encType="multipart/form-data" onSubmit={handleSubmit}>
      <div className="flex items-center flex-col">
        {options.map((option) => {
          const voteCount = sortedVoteEvents.filter((event) => event.optionLabel === option[1]).length;
          return (
            <div key={option[0]}>
              <button
                type="button"
                className={`text-sm text-neutral-500 border ${
                  selectedOption === option[0] ? "border-blue-500" : "border-gray-300"
                } rounded my-2 p-2 w-min text-left whitespace-nowrap`}
                onClick={() => setSelectedOption(option[0])}
              >
                {option[1]}
              </button>{" "}
              {showResults && `(${voteCount})`}
            </div>
          );
        })}
        <div className="flex items-center">
          <div className="inline-flex items-center bg-neutral-800 px-1 py-0.5 rounded-lg w-min">
            <span className="text-xs text-neutral-400">PoW</span>
            <input
              type="number"
              className="bg-neutral-800 text-white text-xs font-medium border-none rounded-lg w-10"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              min={minDiff}
            />
            <button
              type="button"
              onClick={() => setDifficulty((prev) => String(Math.max(parseInt(prev) - 1, parseInt(minDiff))))}
            >
              -
            </button>
            <button type="button" className="pl-0.5" onClick={() => setDifficulty(String(parseInt(difficulty) + 1))}>
              +
            </button>
          </div>
          <div className="ml-2">
            <button
              className="inline-flex items-center bg-neutral-800 px-1 py-0.5 rounded-lg w-min text-xs"
              onClick={() => setShowResults(true)}
              type="button"
            >
              Show Results
            </button>
          </div>
          <div className="ml-2">
            <button
              type="submit"
              className="inline-flex items-center bg-neutral-800 px-1 py-0.5 rounded-lg w-min text-xs"
              disabled={doingWorkProp}
            >
              Submit
            </button>
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
      </div>
    </form>
  );
}