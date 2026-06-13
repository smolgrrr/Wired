import { useState, useEffect } from "react";
import { Event, UnsignedEvent } from "nostr-tools";
import { subPoll } from "../../nostr/subscriptions";
import { verifyPow } from "../../shared/pow/core";
import { timeToGoEst } from "../../shared/utils/timeEstimate";
import { uniqBy } from "../../utils/otherUtils";
import { getPollOptions } from "../../utils/pollUtils";
import { useSubmitForm } from "../../features/compose/useSubmit";
import { Button } from "./Button";
import { SignalStepper } from "./SignalStepper";

export function PollResponder({ eventdata }: { eventdata: Event }) {
  const [options, setOptions] = useState<[string, string][]>(() => getPollOptions(eventdata));
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
    setOptions(getPollOptions(eventdata));

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
      <div className="flex flex-col items-start gap-3 mt-3">
        {options.map((option) => {
          const voteCount = sortedVoteEvents.filter((event) => event.optionLabel === option[1]).length;
          const isSelected = selectedOption === option[0];

          return (
            <div key={option[0]} className="flex items-center gap-2">
              <Button
                type="button"
                variant={isSelected ? "primary" : "ghost"}
                size="sm"
                onClick={() => setSelectedOption(option[0])}
                className="whitespace-nowrap"
              >
                {option[1]}
              </Button>
              {showResults && (
                <span className="text-meta text-muted">({voteCount})</span>
              )}
            </div>
          );
        })}
        <div className="flex flex-wrap items-center gap-2">
          <SignalStepper value={difficulty} onChange={setDifficulty} min={minDiff} />
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowResults(true)}>
            results
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={doingWorkProp} loading={doingWorkProp}>
            transmit
          </Button>
        </div>
        {doingWorkProp ? (
          <p className="text-meta text-secondary" role="status">
            computing signal… ~{timeToGoEst(difficulty, hashrate)}
            {bestPow > 0 ? ` · pb:${bestPow}` : ""}
          </p>
        ) : null}
      </div>
    </form>
  );
}