import { useState } from "react";
import { UnsignedEvent, Event as NostrEvent } from "nostr-tools";
import { useSubmitForm } from "./useSubmit";
import "../../styles/Form.css";
import { useSettings } from "../../app/settings";

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
      <div className="px-4 flex flex-col rounded-lg">
        <div className="h-14 flex items-center justify-between">
          <div className="inline-flex items-center gap-2 bg-neutral-800 px-1.5 py-1 rounded-lg">
            <p className="text-xs font-medium text-neutral-400">{difficulty} PoW</p>
          </div>
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
      {doingWorkProp ? (
        <div className="flex animate-pulse text-sm text-gray-300">
          <span>Doing Work:</span>
          {hashrate && <span>{hashrate} H/s</span>}
        </div>
      ) : null}
      <div id="postFormError" className="text-red-500" />
    </form>
  );
}