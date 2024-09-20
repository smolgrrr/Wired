import {
    CpuChipIcon
} from "@heroicons/react/24/outline";
import { useState, useEffect } from "react";
import { Event } from "nostr-tools";
import { subPoll } from "../../../utils/subscriptions";
import { verifyPow } from "../../../utils/mine";
import { uniqBy } from "../../../utils/otherUtils";
import { UnsignedEvent } from "nostr-tools";
import { useSubmitForm } from "../../forms/handleSubmit";

const timeUnits = [
    { unit: 'c', value: 60 * 60 * 24 * 365.25 * 100 }, // Centuries
    { unit: 'de', value: 60 * 60 * 24 * 365.25 * 10 }, // Decades
    { unit: 'y', value: 60 * 60 * 24 * 365.25 }, // Years
    { unit: 'mo', value: 60 * 60 * 24 * 30 }, // Months
    { unit: 'w', value: 60 * 60 * 24 * 7 },
    { unit: 'd', value: 60 * 60 * 24 },
    { unit: 'h', value: 60 * 60 },
    { unit: 'm', value: 60 },
    { unit: 's', value: 1 },
];

const timeToGoEst = (difficulty: string, hashrate: number): string => {
    const difficultyValue = parseInt(difficulty);
    let estimatedTime = (Math.pow(2, difficultyValue) / (hashrate || 1)) * 1.3;
    let result = '';

    if (hashrate < 50000 && estimatedTime > (60 * 60 * 24 * 3)) {
        return 'calculating'
    }

    for (let unit of timeUnits) {
        if (estimatedTime >= unit.value) {
            const timeInUnit = Math.floor(estimatedTime / unit.value);
            estimatedTime -= timeInUnit * unit.value; // Update estimatedTime to the remainder
            result += `${timeInUnit}${unit.unit} `;
        }
    }

    return result.trim() || 'now'; // Return 'now' if result is empty
};

const PollResponder = ({ key, eventdata }: { key: string; eventdata: Event }) => {
    const [options, setOptions] = useState<[string, string][]>([]);
    const [difficulty, setDifficulty] = useState("0");
    const [minDiff, setMinDiff] = useState("0");
    const [showResults, setShowResults] = useState(false);
    const [voteEvents, setVoteEvents] = useState<Event[]>([]);
    const [unsigned, setUnsigned] = useState<UnsignedEvent>({
        kind: 1018,
        tags: [
            [
                "client",
                "getwired.app"
            ],
            ["e", eventdata.id]
        ],
        content: "",
        created_at: Math.floor(Date.now() / 1000),
        pubkey: "",
    });
    const [selectedOption, setSelectedOption] = useState<string>("");

    const onEvent = (event: Event, relay: string) => {
        setVoteEvents((prevEvents) => [...prevEvents, event]);
    };

    useEffect(() => {
        if (eventdata.kind === 1068) {
            const uniqueOptions = new Map<string, string>();
            eventdata.tags.forEach(tag => {
                if (tag[0] === "option") {
                    uniqueOptions.set(tag[1], tag[2]);
                }
            });
            setOptions(Array.from(uniqueOptions.entries()));
        }

        let minDiff = eventdata.tags.find((t) => t[0] === "PoW")?.[1] || "0";
        if (minDiff !== "0") {
            setDifficulty(minDiff)
            setMinDiff(minDiff)
        }

        if (showResults) {
            subPoll(eventdata.id, onEvent)
        }
    }, [showResults]);

    const uniqVoteEvents = uniqBy(voteEvents, "id");
    const sortedVoteEvents = uniqVoteEvents
        // .filter(event => {
        //     const pow = verifyPow(event);
        //     // Add the pubkey to the set if it passes the filter
        //     if (pow >= parseInt(minDiff)) {
        //       return true;
        //     }
        //     return false;
        //   })
        .map(event => {
            const pow = verifyPow(event); // Calculate once and reuse
            const responseTag = event.tags.find(tag => tag[0] === "response");
            const optionLabel = options.find(option => option[0] === responseTag?.[1])?.[1] || "Unknown";

            return { voteResponse: pow, optionLabel };
        })

    const { handleSubmit: originalHandleSubmit, doingWorkProp, hashrate, bestPow, signedPoWEvent } = useSubmitForm(unsigned, difficulty);
    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault(); // Prevent default form submission
        unsigned.tags.push(['response', selectedOption]);

        await originalHandleSubmit(event);

        setUnsigned(prevUnsigned => ({
            ...prevUnsigned,
            content: '',
            created_at: Math.floor(Date.now() / 1000),
            tags: [
                [
                    "client",
                    "getwired.app"
                ],
                ["e", eventdata.id]
            ],
        }));
    };

    return (
        <form
            name="post"
            method="post"
            encType="multipart/form-data"
            className=""
            onSubmit={handleSubmit}
        >
            <div className="flex items-center flex-col">
                {options.map((option, index) => {
                    const voteCount = sortedVoteEvents.filter(event => event.optionLabel === option[1]).length;
                    return (
                        <div>
                            <button 
                            key={index} 
                            type="button"
                            className={`text-sm text-neutral-500 border ${selectedOption === option[0] ? 'border-blue-500' : 'border-gray-300'} rounded my-2 p-2 w-min text-left whitespace-nowrap`}
                            onClick={() => setSelectedOption(option[0])}
                            >
                                {option[1]}
                            </button> {showResults && `(${voteCount})`}
                        </div>
                    );
                })}
                <div className="flex items-center">
                    <div className="inline-flex items-center bg-neutral-800 px-1 py-0.5 rounded-lg w-min">
                        <div className="inline-flex items-center gap-1.5 text-neutral-300">
                            <CpuChipIcon className="h-4 w-4" />
                        </div>
                        <input
                            type="number"
                            className="bg-neutral-800 text-white text-xs font-medium border-none rounded-lg w-10"
                            value={difficulty}
                            onChange={(e) => setDifficulty(e.target.value)}
                            min={minDiff}
                        />
                        <button
                            type="button"
                            onClick={() => setDifficulty((prev) => String(Math.max(parseInt(prev) - 1, parseInt(minDiff))))} // Decrement, ensuring not below min
                        >
                            -
                        </button>
                        <button
                            type="button"
                            className="pl-0.5"
                            onClick={() => setDifficulty(String(parseInt(difficulty) + 1))} // Increment
                        >
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
                        <span className="pl-1"> (PB:{bestPow}</span><CpuChipIcon className="h-4 w-4" />,
                        <div className="text-xs text-gray-300 pl-1">
                            ~{timeToGoEst(difficulty, hashrate)} total
                        </div>)
                    </div>
                ) : null}
            </div>
        </form>
    );
};

export default PollResponder;
