import { useState } from "react";
import { UnsignedEvent, Event as NostrEvent } from "nostr-tools";
import { useSubmitForm } from "./useSubmit";
import { useSettings } from "../../app/settings";
import { Button } from "../../shared/ui/Button";
import { timeToGoEst } from "../../shared/utils/timeEstimate";

interface RepostFormProps {
  refEvent: NostrEvent;
}

export function RepostForm({ refEvent }: RepostFormProps) {
  const { settings } = useSettings();
  const difficulty = String(settings.difficulty);
  const [unsigned] = useState<UnsignedEvent>({
    kind: 6,
    tags: [
      ["client", "getwired.app"],
      ["e", refEvent.id, "wss://relay.damus.io"],
      ["p", refEvent.pubkey],
    ],
    content: JSON.stringify(refEvent),
    created_at: Math.floor(Date.now() / 1000),
    pubkey: "",
  });

  const { handleSubmit, doingWorkProp, hashrate } = useSubmitForm(unsigned, difficulty);

  return (
    <form name="post" method="post" encType="multipart/form-data" onSubmit={handleSubmit}>
      <div className="px-4 flex flex-col">
        <div className="min-h-14 flex items-center justify-between gap-4">
          <p className="text-meta text-muted">signal {difficulty}</p>
          <Button type="submit" variant="primary" size="sm" disabled={doingWorkProp} loading={doingWorkProp}>
            transmit
          </Button>
        </div>
        {doingWorkProp ? (
          <p className="text-meta text-secondary" role="status">
            computing signal… ~{timeToGoEst(difficulty, hashrate)}
          </p>
        ) : null}
      </div>
      <div id="postFormError" className="text-danger text-meta" />
    </form>
  );
}