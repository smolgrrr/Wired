import { useParams } from 'react-router-dom';
import { useState, useMemo, useEffect } from "react";
import { ArrowUpTrayIcon, CpuChipIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { XCircleIcon } from '@heroicons/react/24/solid';
import { generatePrivateKey, getPublicKey, finishEvent, Event as NostrEvent } from 'nostr-tools';
import { publish } from '../../utils/relays';
import FileUpload from '../../utils/FileUpload';
import { nip19 } from 'nostr-tools';
import { renderMedia } from '../../utils/FileUpload';


const ThreadPost = ({ OPEvent, state, type }: { OPEvent: NostrEvent, state: Boolean, type: String }) => {
    const { id } = useParams();
    const [comment, setComment] = useState("");
    const [file, setFile] = useState("");
    const [difficulty, setDifficulty] = useState(localStorage.getItem('difficulty') || '21');
    const [uploadingFile, setUploadingFile] = useState(false);
    let decodeResult = nip19.decode(id as string);

    const [sk, setSk] = useState(generatePrivateKey());

    const [messageFromWorker, setMessageFromWorker] = useState(null);
    const [doingWorkProp, setDoingWorkProp] = useState(false);
    // Initialize the worker outside of any effects
    const worker = useMemo(() => new Worker(new URL('../../powWorker', import.meta.url)), []);

    useEffect(() => {
        worker.onmessage = (event) => {
            setMessageFromWorker(event.data);
        };

        const handleDifficultyChange = (event: Event) => {
            const customEvent = event as CustomEvent;
            setDifficulty(customEvent.detail);
        };

        window.addEventListener('difficultyChanged', handleDifficultyChange);

        return () => {
            window.removeEventListener('difficultyChanged', handleDifficultyChange);
        };
    }, []);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        let id = decodeResult.data as string

        let tags = [];
        let modifiedComment = comment + " " + file;
        if (type === 'r') {
            tags.push(["e", id as string])
            tags.push(["p", OPEvent.pubkey])
        } else if (type === 'q') {
            tags.push(["q", id as string])
            tags.push(["p", OPEvent.pubkey])
            modifiedComment += ' nostr:' + nip19.noteEncode(id);
        }

        try {
            worker.postMessage({
                unsigned: {
                    kind: 1,
                    tags,
                    content: modifiedComment,
                    created_at: Math.floor(Date.now() / 1000),
                    pubkey: getPublicKey(sk),
                }, difficulty
            });

        } catch (error) {
            setComment(comment + " " + error);
        }
    };

    useEffect(() => {
        setDoingWorkProp(false)
        if (messageFromWorker) {
            try {
                const signedEvent = finishEvent(messageFromWorker, sk);
                publish(signedEvent);

                setComment("");
                setFile("");
                setSk(generatePrivateKey())
                setMessageFromWorker(null);

                return () => {
                    worker.terminate();
                };
            } catch (error) {
                setComment(error + ' ' + comment);
            }
        }
    }, [messageFromWorker]);

    async function attachFile(file_input: File | null) {
        setUploadingFile(true);  // start loading
        try {
            if (file_input) {
                const rx = await FileUpload(file_input);
                setUploadingFile(false);  // stop loading
                if (rx.url) {
                    setFile(rx.url);
                } else if (rx?.error) {
                    setFile(rx.error);
                }
            }
        } catch (error: unknown) {
            setUploadingFile(false);  // stop loading
            if (error instanceof Error) {
                setFile(error?.message);
            }
        }
    }


    return (
        <>
            {state && (
                <form
                    name="post"
                    method="post"
                    encType="multipart/form-data"
                    className=""
                    onSubmit={(event) => {
                        handleSubmit(event);
                        setDoingWorkProp(true);
                    }}
                >
                    <input type="hidden" name="MAX_FILE_SIZE" defaultValue={4194304} />
                    <div id="togglePostFormLink" className="text-lg font-semibold">
                        {type === 'r' ? <span>Reply To Post</span> : <span>Quote Post</span>}
                    </div>
                    <div>
                        <textarea
                            name="com"
                            wrap="soft"
                            className="w-full p-2 rounded bg-gradient-to-r from-blue-900 to-cyan-500 text-white border-none placeholder-blue-300"
                            placeholder='Shitpost here...'
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                        />
                    </div>
                    <div className="relative">
                    {file != '' &&
                        <button onClick={() => setFile('')}><XCircleIcon className="h-10 w-10 absolute shadow z-100 text-blue-500" /></button>
                    }
                    {renderMedia(file)}  
                    </div>
                    <div className="flex justify-between items-center">
                        <div className="flex items-center">
                            <ArrowUpTrayIcon
                                className="h-6 w-6 text-white cursor-pointer"
                                onClick={() => document.getElementById('file_input')?.click()}
                            />
                            <input
                                type="file"
                                name="file_input"
                                id="file_input"
                                style={{ display: 'none' }}
                                onChange={(e) => {
                                    const file_input = e.target.files?.[0];
                                    if (file_input) {
                                        attachFile(file_input);
                                    }
                                }}
                            />
                            {uploadingFile ? (
                                <div className='flex animate-spin text-sm text-gray-300'>
                                    <ArrowPathIcon className="h-4 w-4 ml-auto" />
                                </div>
                            ) : null}
                        </div>
                        <span className="flex items-center"><CpuChipIcon className="h-6 w-6 text-white" />: {difficulty}</span>
                        <button type="submit" className="px-4 py-2 bg-gradient-to-r from-cyan-900 to-blue-500 rounded text-white font-semibold">
                            Submit
                        </button>
                    </div>
                    {doingWorkProp ? (
                        <div className='flex animate-pulse text-sm text-gray-300'>
                            <CpuChipIcon className="h-4 w-4 ml-auto" />
                            <span>Generating Proof-of-Work...</span>
                        </div>
                    ) : null}
                    <div id="postFormError" className="text-red-500" />
                </form>)}
        </>
    );
};

export default ThreadPost;