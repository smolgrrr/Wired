import { useParams } from 'react-router-dom';
import { useState } from "react";
import { ArrowUpTrayIcon, CpuChipIcon } from '@heroicons/react/24/outline';
import { generatePrivateKey, getPublicKey, finishEvent, relayInit } from 'nostr-tools';
import { minePow } from '../../utils/mine';
import { publish } from '../../utils/relays';
import NostrImg from '../../utils/ImgUpload';
import { nip19 } from 'nostr-tools';


const difficulty = 25

const ThreadPost = ({ state, type }: { state: Boolean, type: String }) => {
    const { id} = useParams();
    const [comment, setComment] = useState("");
    const [file, setFile] = useState("");

    let decodeResult = nip19.decode(id as string);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        let sk = generatePrivateKey();
        let id = decodeResult.data as string

        let tags = []; 
        if (type === 'r') {
            tags.push(["e", id as string])
        } else if (type === 'q') {
            tags.push(["q", id as string])
            setComment(comment + ' nostr:' + id)
        }

        try {
            const event = minePow({
                kind: 1,
                tags,
                content: comment + " " + file,
                created_at: Math.floor(Date.now() / 1000),
                pubkey: getPublicKey(sk),
            }, difficulty);

            const signedEvent = finishEvent(event, sk);
            await publish(signedEvent);
            console.log(signedEvent.id);

        } catch (error) {
            setComment(comment + " " + error);
        }
    };

    async function attachFile(file_input: File | null) {
        try {
            if (file_input) {
                const rx = await NostrImg(file_input);
                if (rx.url) {
                    setFile(rx.url);
                } else if (rx?.error) {
                    setFile(rx.error);
                }
            }
        } catch (error: unknown) {
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
                    onSubmit={handleSubmit}
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
                    <div>
                        {file !== "" && (
                            <div className="file m-0.5">
                                <img
                                    src={file}
                                    loading="lazy"
                                />
                            </div>
                        )}
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
                        </div>
                        <span className="flex items-center"><CpuChipIcon className="h-6 w-6 text-white" />: {difficulty}</span>
                        <button type="submit" className="px-4 py-2 bg-gradient-to-r from-cyan-900 to-blue-500 rounded text-white font-semibold">
                            Submit
                        </button>
                    </div>
                    <div id="postFormError" className="text-red-500" />
                </form>)}
        </>
    );
};

export default ThreadPost;