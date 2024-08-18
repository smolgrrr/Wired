import {
    CpuChipIcon
} from "@heroicons/react/24/outline";
import { useState, useEffect } from "react";
import { UnsignedEvent, Event as NostrEvent, nip19 } from "nostr-tools";
import { useSubmitForm } from "./handleSubmit";
import "../../styles/Form.css";
import EmotePicker from "../modals/EmotePicker/EmotePicker";
import emotes from "../modals/EmotePicker/custom_emojis.json"

interface FormProps {
    refEvent?: NostrEvent;
    tagType?: 'Reply' | 'Quote' | '';
    hashtag?: string;
}

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
        localStorage.getItem("difficulty") || "21"
    );

    useEffect(() => {
        if (hashtag) {
            unsigned.tags.push(['t', hashtag as string]);
        }

        if (refEvent && tagType) {
            unsigned.tags = Array.from(new Set(unsigned.tags.concat(refEvent.tags)));
            unsigned.tags.push(['p', refEvent.pubkey]);
        
            if (tagType === 'Reply') {
                unsigned.tags.push(['e', refEvent.id, refEvent.tags.some(tag => tag[0] === 'e') ? 'root' : '']);
            } else {
                if (tagType === 'Quote') {
                    setComment(comment + '\nnostr:' + nip19.noteEncode(refEvent.id));
                    unsigned.tags.push(['q', refEvent.id]);
                } else {
                    unsigned.tags.push(['e', refEvent.id]);
                }
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

    const { handleSubmit: originalHandleSubmit, doingWorkProp, doingWorkProgress } = useSubmitForm(unsigned, difficulty);

    const handleSubmit = async (event: React.FormEvent) => {
        await originalHandleSubmit(event);
        setComment("");
        setUnsigned(prevUnsigned => ({
            ...prevUnsigned,
            content: '',
            created_at: Math.floor(Date.now() / 1000)
        }));
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
                    className="shadow-lg w-full px-4 py-3 border-blue-500 bg-black text-white"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={comment.split('\n').length || 1}
                />
                <div className="h-14 flex items-center justify-between">
                    <div className="inline-flex items-center gap-2 bg-neutral-800 px-1.5 py-1 rounded-lg">
                        <div className="inline-flex items-center gap-1.5 text-neutral-300">
                            <CpuChipIcon className="h-4 w-4" />
                        </div>
                        <p className="text-xs font-medium text-neutral-400">
                            {difficulty} Work
                        </p>
                    </div>
                    <div>
                        <div className="flex items-center gap-4">
                            <EmotePicker onEmojiSelect={(emoji: Emoji) => onEmojiSelect(emoji)} />
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
            </div>
            {doingWorkProp ? (
                <div className="flex animate-pulse text-sm text-gray-300">
                    <CpuChipIcon className="h-4 w-4 ml-auto" />
                    <span>Doing Work:</span>
                    {doingWorkProgress && <span>{doingWorkProgress} hashes</span>}
                </div>
            ) : null}
            <div id="postFormError" className="text-red-500" />
        </form>
    );
};

export default NewNoteCard;
