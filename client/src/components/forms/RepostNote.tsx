import {
    CpuChipIcon
} from "@heroicons/react/24/outline";
import { useState, useEffect } from "react";
import { UnsignedEvent, Event as NostrEvent, nip19 } from "nostr-tools";
import { useSubmitForm } from "./handleSubmit";
import "../../styles/Form.css";
import { DEFAULT_DIFFICULTY } from "../../config";

interface FormProps {
    refEvent: NostrEvent;
}

const RepostNote = ({
    refEvent
}: FormProps) => {
    const [difficulty, setDifficulty] = useState(
        localStorage.getItem("difficulty") || DEFAULT_DIFFICULTY.toString()
    );
    const [unsigned] = useState<UnsignedEvent>({
        kind: 6,
        tags: [
            ['client', 'getwired.app'],
            ['e', refEvent.id, 'wss://relay.damus.io'],
            ['p', refEvent.pubkey]
        ],
        content: JSON.stringify(refEvent),
        created_at: Math.floor(Date.now() / 1000),
        pubkey: "",
    });

    useEffect(() => {
        const handleDifficultyChange = (event: Event) => {
            const customEvent = event as CustomEvent;
            const { difficulty } = customEvent.detail;
            setDifficulty(difficulty);
        };

        window.addEventListener("difficultyChanged", handleDifficultyChange);

        return () => {
            window.removeEventListener("difficultyChanged", handleDifficultyChange);
        };
    }, []);

    const { handleSubmit, doingWorkProp, hashrate } = useSubmitForm(unsigned, difficulty);

    return (
        <form
            name="post"
            method="post"
            encType="multipart/form-data"
            className=""
            onSubmit={handleSubmit}
        >
            <div className="px-4 flex flex-col rounded-lg">
                <div className="h-14 flex items-center justify-between">
                    <div className="inline-flex items-center gap-2 bg-neutral-800 px-1.5 py-1 rounded-lg">
                        <div className="inline-flex items-center gap-1.5 text-neutral-300">
                            <CpuChipIcon className="h-4 w-4" />
                        </div>
                        <p className="text-xs font-medium text-neutral-400">
                            {difficulty} PoW
                        </p>
                    </div>
                            <button
                                type="submit"
                                className={`bg-black border h-9 inline-flex items-center justify-center px-4 rounded-lg text-white font-medium text-sm ${doingWorkProp ? 'cursor-not-allowed' : ''}`}
                                disabled={doingWorkProp}
                            >
                                Submit
                            </button>
                </div>
            </div>
            {doingWorkProp ? (
                <div className="flex animate-pulse text-sm text-gray-300">
                    <CpuChipIcon className="h-4 w-4 ml-auto" />
                    <span>Doing Work:</span>
                    {hashrate && <span>{hashrate} H/s</span>}
                </div>
            ) : null}
            <div id="postFormError" className="text-red-500" />
        </form>
    );
};

export default RepostNote;
