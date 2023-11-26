import {
    ArrowUpTrayIcon,
    CpuChipIcon,
    ArrowPathIcon,
    FaceSmileIcon
} from "@heroicons/react/24/outline";
import { XCircleIcon } from "@heroicons/react/24/solid";
import { useState, useEffect, useRef } from "react";
import { UnsignedEvent, Event as NostrEvent, nip19 } from "nostr-tools";
import { renderMedia, attachFile } from "../../utils/FileUpload";
import { EmojiPicker } from "./Emojis/emoji-picker";
import customEmojis from './custom_emojis.json';
import { useSubmitForm } from "./handleSubmit";
import "./Form.css";

interface FormProps {
    refEvent?: NostrEvent;
    tagType?: 'Reply' | 'Quote' | '';
}

const tagMapping = {
    'Reply': ['e', 'p'],
    'Quote': ['q', 'p']
};

const NewNoteCard = ({
    refEvent,
    tagType
}: FormProps) => {
    const ref = useRef<HTMLDivElement | null>(null);
    const [comment, setComment] = useState("");
    const [file, setFile] = useState("");
    const [unsigned, setUnsigned] = useState<UnsignedEvent>({
        kind: 1,
        tags: [],
        content: "",
        created_at: Math.floor(Date.now() / 1000),
        pubkey: "",
    });
    const [difficulty, setDifficulty] = useState(
        localStorage.getItem("difficulty") || "21"
    );
    const [fileSizeError, setFileSizeError] = useState(false);
    const [uploadingFile, setUploadingFile] = useState(false);

    useEffect(() => {
        if (refEvent && tagType && unsigned.tags.length === 0) {
            const tags = tagMapping[tagType];
            if (tags) {
                tags.forEach(tag => unsigned.tags.push([tag, refEvent[tag === 'p' ? 'pubkey' : 'id']]));
            }
            if (tagType === 'Quote') {
                setComment(comment + '\nnostr:' + nip19.noteEncode(refEvent.id));
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
            content: `${comment} ${file}`,
            created_at: Math.floor(Date.now() / 1000),
        }));
    }, [comment, file]);

    const { handleSubmit: originalHandleSubmit, doingWorkProp, doingWorkProgress } = useSubmitForm(unsigned, difficulty);

    const handleSubmit = async (event: React.FormEvent) => {
        await originalHandleSubmit(event);
        setComment("");
        setFile("");
        setUnsigned(prevUnsigned => ({
            ...prevUnsigned,
            content: '',
            created_at: Math.floor(Date.now() / 1000)
        }));
    };

    //Emoji stuff
    const emojiRef = useRef(null);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);

    interface Emoji {
        native?: string;
        id?: string;
    }

    const emojiNames = customEmojis.map(p => p.emojis).flat();
    function getEmojiById(id: string) {
        return emojiNames.find(e => e.shortcode === id);
    }

    async function onEmojiSelect(emoji: Emoji) {
        setShowEmojiPicker(false);
        try {
            if (emoji.id) {
                const e = getEmojiById(emoji.id);
                if (e) {
                    setComment(comment + " :" + e.shortcode + ":");
                    unsigned.tags.push(['emoji', e.shortcode, e.url]);
                };
            }
        } catch {
            //ignore
        }
    }

    const topOffset = ref.current?.getBoundingClientRect().top;
    const leftOffset = ref.current?.getBoundingClientRect().left;

    function pickEmoji(e: React.MouseEvent) {
        e.stopPropagation();
        setShowEmojiPicker(!showEmojiPicker);
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
                {"C:\\WIRE>"}
                <textarea
                    name="com"
                    wrap="soft"
                    className="shadow-lg w-full px-4 py-3 h-28 border-none bg-black text-white"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                />
                <div className="relative">
                    {file !== "" && (
                        <button onClick={() => setFile("")}>
                            <XCircleIcon className="h-10 w-10 absolute shadow z-100 text-blue-500" />
                        </button>
                    )}
                    {renderMedia(file)}
                </div>
                <div className="h-14 flex items-center justify-between">
                    <div className="inline-flex items-center gap-2 bg-neutral-800 px-1.5 py-1 rounded-lg">
                        <div className="inline-flex items-center gap-1.5 text-neutral-300">
                            <CpuChipIcon className="h-4 w-4" />
                        </div>
                        <p className="text-xs font-medium text-neutral-400">
                            {difficulty} PoW
                        </p>
                    </div>
                    <div>
                        <div className="flex items-center gap-4">
                            <div className="items-center">
                                {showEmojiPicker && (
                                    <EmojiPicker
                                        topOffset={topOffset || 0}
                                        leftOffset={leftOffset || 0}
                                        onEmojiSelect={onEmojiSelect}
                                        onClickOutside={() => setShowEmojiPicker(false)}
                                        ref={emojiRef}
                                    />
                                )}
                                <FaceSmileIcon className="h-4 w-4 text-neutral-400 cursor-pointer" onClick={pickEmoji} />
                            </div>
                            <div className="flex items-center">
                                <ArrowUpTrayIcon
                                    className="h-4 w-4 text-neutral-400 cursor-pointer"
                                    onClick={() => document.getElementById("file_input")?.click()}
                                />
                                <input
                                    type="file"
                                    name="file_input"
                                    id="file_input"
                                    style={{ display: "none" }}
                                    onChange={async (e) => {
                                        const file_input = e.target.files?.[0];
                                        if (file_input) {
                                            // Check if file size is greater than 2.5MB
                                            if (file_input.size > 2.5 * 1024 * 1024) {
                                                setFileSizeError(true);
                                                return;
                                            }
                                            setUploadingFile(true);
                                            const attachedFile = await attachFile(file_input);
                                            setFile(attachedFile);
                                            setUploadingFile(false);
                                            setFileSizeError(false);
                                        }
                                    }}
                                />
                                {uploadingFile ? (
                                    <div className="flex animate-spin text-sm text-gray-300">
                                        <ArrowPathIcon className="h-4 w-4 ml-auto" />
                                    </div>
                                ) : null}
                            </div>
                            <button
                                type="submit"
                                className={`bg-black border h-9 inline-flex items-center justify-center px-4 rounded-lg text-white font-medium text-sm ${doingWorkProp || uploadingFile ? 'cursor-not-allowed' : ''}`}
                                disabled={doingWorkProp || uploadingFile}
                            >
                                Submit
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            {fileSizeError ? (
                <span className="text-red-500">File size should not exceed 2.5MB</span>
            ) : null}
            {doingWorkProp ? (
                <div className="flex animate-pulse text-sm text-gray-300">
                    <CpuChipIcon className="h-4 w-4 ml-auto" />
                    <span>Generating Proof-of-Work.</span>
                    {doingWorkProgress && <span>Current iteration {doingWorkProgress}</span>}
                </div>
            ) : null}
            <div id="postFormError" className="text-red-500" />
        </form>
    );
};

export default NewNoteCard;
