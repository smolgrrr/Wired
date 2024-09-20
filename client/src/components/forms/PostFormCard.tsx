import {
    CpuChipIcon
} from "@heroicons/react/24/outline";
import { useState, useEffect } from "react";
import { UnsignedEvent, Event as NostrEvent, nip19 } from "nostr-tools";
import { useSubmitForm } from "./handleSubmit";
import "../../styles/Form.css";
import EmotePicker from "../modals/EmotePicker/EmotePicker";
import { DEFAULT_DIFFICULTY } from "../../config";
import PostCard from "../modals/PostCard";

interface FormProps {
    refEvent?: NostrEvent;
    tagType?: 'Reply' | 'Quote' | '';
    hashtag?: string;
}

// LOL
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

const NewNoteCard = ({
    refEvent,
    tagType,
    hashtag,
}: FormProps) => {
    const [comment, setComment] = useState("");
    const [unsigned, setUnsigned] = useState<UnsignedEvent>({
        kind: 1,
        tags: [
            [
                "client",
                "getwired.app"
            ]
        ],
        content: "",
        created_at: Math.floor(Date.now() / 1000),
        pubkey: "",
    });
    const [difficulty, setDifficulty] = useState(
        localStorage.getItem("difficulty") || DEFAULT_DIFFICULTY.toString()
    );
    const [pollOptions, setPollOptions] = useState(['', '']);
    const [pollDifficulty, setPollDifficulty] = useState("15");

    useEffect(() => {
        if (hashtag) {
            unsigned.tags.push(['t', hashtag as string]);
        }

        if (refEvent && tagType) {
            unsigned.tags.push(['p', refEvent.pubkey]);
            const addEventTags = () => {
                unsigned.tags = Array.from(new Set([
                    ...unsigned.tags,
                    ...refEvent.tags.filter(tag => tag[0] === 'e' || tag[0] === 'p')
                ]));
                unsigned.tags.push(['e', refEvent.id]);
            };

            switch (tagType) {
                case 'Reply':
                    addEventTags();
                    break;
                case 'Quote':
                    unsigned.tags.push(['q', refEvent.id]);
                    setComment(comment + '\nnostr:' + nip19.noteEncode(refEvent.id));
                    break;
                default:
                    addEventTags();
                    break;
            }
        }

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

    useEffect(() => {
        setUnsigned(prevUnsigned => ({
            ...prevUnsigned,
            content: `${comment}`,
            created_at: Math.floor(Date.now() / 1000),
        }));
    }, [comment]);

    useEffect(() => {
        if (pollOptions.some(option => option !== '')) {
            const generateOptionId = () => Math.random().toString(36).substring(2, 11);

            setUnsigned(prevUnsigned => ({
                ...prevUnsigned,
                kind: 1068,
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    ["label", `${comment}`],
                    ...pollOptions.map(option => ["option", generateOptionId(), option]),
                    ["relay", "wss://relay.damus.io/"],
                    ["relay", "wss://nos.lol"],
                    ["PoW", pollDifficulty],
                    ["polltype", "singlechoice"]
                ]
            }));
        }
    }, [pollOptions, pollDifficulty]);

    const { handleSubmit: originalHandleSubmit, doingWorkProp, hashrate, bestPow, signedPoWEvent } = useSubmitForm(unsigned, difficulty);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault(); // Prevent default form submission

        if (comment.trim() === "") {
            return; // Don't submit if comment is empty or just whitespace
        }

        // Check if tagType is 'Quote' and update comment
        if (tagType === 'Quote' && refEvent) {
            setComment(prevComment => prevComment + '\nnostr:' + nip19.noteEncode(refEvent.id));
        }

        await originalHandleSubmit(event);

        setPollOptions(['', '']);
        setComment("");
        setUnsigned({
            kind: 1,
            tags: [
                [
                    "client",
                    "getwired.app"
                ]
            ],
            content: "",
            created_at: Math.floor(Date.now() / 1000),
            pubkey: "",
        });
    };

    //Emoji stuff
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);

    interface Emoji {
        category: string;
        shortcode: string;
        static_url: string;
        tags: string[];
        url: string;
        visible_in_picker: boolean;
    }

    async function onEmojiSelect(emoji: Emoji) {
        setShowEmojiPicker(false);
        setComment(comment + " :" + emoji.shortcode + ":");
        unsigned.tags.push(['emoji', emoji.shortcode, emoji.url]);
    }

    return (
        <form
            name="post"
            method="post"
            encType="multipart/form-data"
            className=""
            onSubmit={handleSubmit}
        >
            <input type="hidden" name="MAX_FILE_SIZE" defaultValue={2.5 * 1024 * 1024} />
            <div className="px-4 flex flex-col rounded-lg">
                <textarea
                    name="com"
                    wrap="soft"
                    className="shadow-lg w-full px-4 py-3 border-blue-500 bg-black text-white h-auto"
                    value={comment}
                    onChange={(e) => {
                        setComment(e.target.value);
                        e.target.style.height = 'auto'; // Reset height
                        e.target.style.height = `${e.target.scrollHeight}px`; // Set height to scrollHeight
                    }}
                    rows={comment.split('\n').length || 1}
                />
                {pollOptions.some(option => option !== '') &&
                    <div className="flex flex-col items-center gap-2 text-xs">
                        <h3 className="text-xs text-neutral-300">Poll Options: </h3>
                        <ul className="">
                            {pollOptions.map((option, index) => (
                                <li key={index}>{option}</li>
                            ))}
                        </ul>
                    </div>
                }
                <div className="h-14 flex items-center justify-between">
                    <div className="inline-flex items-center bg-neutral-800 px-1 py-0.5 rounded-lg">
                        <div className="inline-flex items-center gap-1.5 text-neutral-300">
                            <CpuChipIcon className="h-4 w-4" />
                        </div>
                        <input
                            type="number"
                            className="bg-neutral-800 text-white text-xs font-medium border-none rounded-lg w-10"
                            value={difficulty}
                            onChange={(e) => setDifficulty(e.target.value)}
                            min="16"
                        />
                        <button
                            type="button"
                            onClick={() => setDifficulty(String(Math.max(10, parseInt(difficulty) - 1)))} // Decrement, ensuring not below min
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
                    <div>
                        <div className="flex items-center gap-4">
                            <EmotePicker
                                onEmojiSelect={(emoji: Emoji) => onEmojiSelect(emoji)}
                                pollOptions={pollOptions}
                                setPollOptions={setPollOptions}
                                pollDifficulty={pollDifficulty}
                                setPollDifficulty={setPollDifficulty}
                            />
                            <button
                                type="submit"
                                className={`bg-black border h-9 inline-flex items-center justify-center px-4 rounded-lg text-white font-medium text-sm ${doingWorkProp ? 'cursor-not-allowed' : ''}`}
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
                        <span className="pl-1"> (PB:{bestPow}</span><CpuChipIcon className="h-4 w-4" />,
                        <div className="text-xs text-gray-300 pl-1">
                            ~{timeToGoEst(difficulty, hashrate)} total
                        </div>)
                    </div>
                ) : null}
                {signedPoWEvent && (
                    <PostCard
                        key={signedPoWEvent.id}
                        event={signedPoWEvent}
                        metadata={null}
                        replies={[]}
                    />
                )}
            </div>
            <div id="postFormError" className="text-red-500" />
        </form>
    );
};

export default NewNoteCard;
