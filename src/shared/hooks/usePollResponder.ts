import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { Event } from "nostr-tools";
import { subPoll } from "../../nostr/subscriptions";
import {
  buildPollResponseDraft,
  getPollOptionResults,
  type PollOptionResult,
  type PollViewModel,
} from "@lib/pollUtils";
import { useSubmitForm } from "./useSubmitForm";

export type PollResponderState = {
  options: PollOptionResult[];
  difficulty: string;
  minDifficulty: string;
  showResults: boolean;
  selectedOptionId: string;
  doingWork: boolean;
  submitStatus: ReturnType<typeof useSubmitForm>["submitStatus"];
  submitError: string | null;
  acceptedRelayCount: number;
  hashrate: number;
  bestPow: number;
  selectOption: (optionId: string) => void;
  setDifficulty: (difficulty: string) => void;
  revealResults: () => void;
  submit: (event: FormEvent) => Promise<void>;
};

export function usePollResponder(poll: PollViewModel): PollResponderState {
  const [difficulty, setDifficulty] = useState(poll.minDifficulty);
  const [showResults, setShowResults] = useState(false);
  const [voteEvents, setVoteEvents] = useState<Event[]>([]);
  const [selectedOptionId, setSelectedOptionId] = useState("");

  useEffect(() => {
    setDifficulty(poll.minDifficulty);
    setShowResults(false);
    setVoteEvents([]);
    setSelectedOptionId("");
  }, [poll.id, poll.minDifficulty]);

  useEffect(() => {
    if (!showResults) return;

    const subscription = subPoll(poll.id, (event) => {
      setVoteEvents((prevEvents) => [...prevEvents, event]);
    });

    return () => subscription.close();
  }, [poll.id, showResults]);

  const submitEvent = useMemo(
    () => buildPollResponseDraft(poll.id, selectedOptionId),
    [poll.id, selectedOptionId],
  );

  const {
    handleSubmit,
    doingWorkProp,
    submitStatus,
    submitError,
    acceptedRelays,
    hashrate,
    bestPow,
    signedPoWEvent,
  } = useSubmitForm(submitEvent, difficulty);

  useEffect(() => {
    if (!signedPoWEvent) return;

    setSelectedOptionId("");
  }, [signedPoWEvent]);

  const options = useMemo(
    () => getPollOptionResults(poll.options, voteEvents),
    [poll.options, voteEvents],
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    await handleSubmit(event);
  };

  return {
    options,
    difficulty,
    minDifficulty: poll.minDifficulty,
    showResults,
    selectedOptionId,
    doingWork: doingWorkProp,
    submitStatus,
    submitError,
    acceptedRelayCount: acceptedRelays.length,
    hashrate,
    bestPow,
    selectOption: setSelectedOptionId,
    setDifficulty,
    revealResults: () => setShowResults(true),
    submit,
  };
}
