import {
    ArrowUpTrayIcon,
    CpuChipIcon,
    ArrowPathIcon,
    FaceSmileIcon
} from "@heroicons/react/24/outline";
import { XCircleIcon } from "@heroicons/react/24/solid";
import { useState, useEffect, useRef } from "react";
import { generatePrivateKey, getPublicKey, finishEvent, UnsignedEvent, Event as NostrEvent, nip19 } from "nostr-tools";
import { publish } from "../../utils/relays";
import { renderMedia, attachFile } from "../../utils/FileUpload";
import { EmojiPicker } from "./Emojis/emoji-picker";
import customEmojis from './custom_emojis.json';

const useWorkers = (numCores: number, unsigned: UnsignedEvent, difficulty: string, deps: any[]) => {
    const [messageFromWorker, setMessageFromWorker] = useState(null);
    const [doingWorkProgress, setDoingWorkProgress] = useState(0);

    const startWork = () => {
        const workers = Array(numCores).fill(null).map(() => new Worker(new URL("../../powWorker", import.meta.url)));

        workers.forEach((worker, index) => {
            worker.onmessage = (event) => {
                if (event.data.status === 'progress') {
                    console.log(`Worker progress: Checked ${event.data.currentNonce} nonces.`);
                    setDoingWorkProgress(event.data.currentNonce);
                } else if (event.data.found) {
                    setMessageFromWorker(event.data.event);
                    // Terminate all workers once a solution is found
                    workers.forEach(w => w.terminate());
                }
            };

            worker.postMessage({
                unsigned,
                difficulty,
                nonceStart: index, // Each worker starts from its index
                nonceStep: numCores  // Each worker increments by the total number of workers
            });
        });
    };

    return { startWork, messageFromWorker, doingWorkProgress };
};

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
    const [sk, setSk] = useState(generatePrivateKey());
    const [unsigned, setUnsigned] = useState<UnsignedEvent>({
        kind: 1,
        tags: [],
        content: "",
        created_at: Math.floor(Date.now() / 1000),
        pubkey: getPublicKey(sk),
    });
    const [difficulty, setDifficulty] = useState(
        localStorage.getItem("difficulty") || "21"
    );
    const [fileSizeError, setFileSizeError] = useState(false);

    const [uploadingFile, setUploadingFile] = useState(false);
    const [doingWorkProp, setDoingWorkProp] = useState(false);

    // Initialize the worker outside of any effects
    const numCores = navigator.hardwareConcurrency || 4;

    const { startWork, messageFromWorker, doingWorkProgress } = useWorkers(numCores, unsigned, difficulty, [unsigned]);

    useEffect(() => {
        if (refEvent && tagType && unsigned.tags.length === 0) {
            const tags = tagMapping[tagType];
            if (tags) {
                tags.forEach(tag => unsigned.tags.push([tag, refEvent[tag === 'p' ? 'pubkey' : 'id']]));
            }

            if (tagType === 'Quote') {
                setComment(comment + ' nostr:' + nip19.noteEncode(refEvent.id));
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
            pubkey: getPublicKey(sk),
        }));
    }, [comment, file]);

    useEffect(() => {
        setDoingWorkProp(false);
        if (messageFromWorker) {
            try {
                const signedEvent = finishEvent(messageFromWorker, sk);
                publish(signedEvent);

                setComment("");
                setFile("");
                setSk(generatePrivateKey());
                setUnsigned(prevUnsigned => ({
                    ...prevUnsigned,
                    content: '',
                    created_at: Math.floor(Date.now() / 1000),
                    pubkey: getPublicKey(sk),
                }));
            } catch (error) {
                setComment(error + " " + comment);
            }
        }
    }, [messageFromWorker]);

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
            onSubmit={(event) => {
                event.preventDefault();
                startWork();
                setDoingWorkProp(true);
            }}
        >
            <input type="hidden" name="MAX_FILE_SIZE" defaultValue={2.5 * 1024 * 1024} />
            <div
                id="togglePostFormLink"
                className="text-lg text-neutral-500 text-center mb-2 font-semibold"
            >
                {tagType === 'Reply' ? 'Reply to thread' : 'Start New Thread'}
            </div>
            <div className="px-4 pt-4 flex flex-col bg-neutral-900 rounded-lg">
                <textarea
                    name="com"
                    wrap="soft"
                    className="shadow-lg w-full px-4 py-3 h-28 rounded-md outline-none focus:outline-none bg-neutral-800 border border-neutral-700 text-white placeholder:text-neutral-500"
                    placeholder="Shitpost here..."
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
                                className={`h-9 inline-flex items-center justify-center px-4 rounded-lg text-white font-medium text-sm ${doingWorkProp || uploadingFile ? 'bg-blue-900 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600'}`}
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
                    <span>Generating Proof-of-Work:</span>
                    <span>iteration {doingWorkProgress}</span>
                </div>
            ) : null}
            <div id="postFormError" className="text-red-500" />
        </form>
    );
};

export default NewNoteCard;
