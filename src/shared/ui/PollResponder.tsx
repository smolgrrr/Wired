import type { PollViewModel } from "@lib/pollUtils";
import { usePollResponder } from "../hooks/usePollResponder";
import { Button } from "./Button";
import { PowTransmitStatus } from "./PowTransmitStatus";
import { SignalStepper } from "./SignalStepper";

export function PollResponder({ poll }: { poll: PollViewModel }) {
  const responder = usePollResponder(poll);

  return (
    <form name="post" method="post" encType="multipart/form-data" onSubmit={responder.submit}>
      <div className="flex flex-col items-start gap-3 mt-3">
        {responder.options.map((option) => {
          const isSelected = responder.selectedOptionId === option.id;

          return (
            <div key={option.id} className="flex items-center gap-2">
              <Button
                type="button"
                variant={isSelected ? "primary" : "ghost"}
                size="sm"
                onClick={() => responder.selectOption(option.id)}
                className="whitespace-nowrap"
              >
                {option.label}
              </Button>
              {responder.showResults && (
                <span className="text-meta text-muted">({option.voteCount})</span>
              )}
            </div>
          );
        })}
        <div className="flex flex-wrap items-center gap-2">
          <SignalStepper
            value={responder.difficulty}
            onChange={responder.setDifficulty}
            min={responder.minDifficulty}
          />
          <Button type="button" variant="ghost" size="sm" onClick={responder.revealResults}>
            results
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={responder.doingWork}
            loading={responder.doingWork}
          >
            transmit
          </Button>
        </div>
        <PowTransmitStatus
          active={responder.doingWork}
          difficulty={responder.difficulty}
          hashrate={responder.hashrate}
          bestPow={responder.bestPow}
          status={responder.submitStatus}
        />
        {responder.submitError && <p className="text-danger text-meta">{responder.submitError}</p>}
        {responder.submitStatus === "published" && responder.acceptedRelayCount > 0 && (
          <p className="text-meta text-secondary">
            posted to {responder.acceptedRelayCount} relay
            {responder.acceptedRelayCount === 1 ? "" : "s"}
          </p>
        )}
      </div>
    </form>
  );
}
