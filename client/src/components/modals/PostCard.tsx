import { FolderIcon, CpuChipIcon } from "@heroicons/react/24/outline";
import { parseContent } from "../../utils/content";
import { Event, nip19 } from "nostr-tools";
import { getMetadata } from "../../utils/getMetadata";
import { getIconFromHash, timeAgo } from "../../utils/cardUtils";
import { verifyPow } from "../../utils/mine";
import { uniqBy } from "../../utils/otherUtils";
import ContentPreview from "./CardModals/TextModal";
import CardContainer from "./CardContainer";
import React, { useState, useEffect, useMemo} from "react";
import RenderMedia from "./MediaRender";

interface CardProps {
    key?: string | number;
    event: Event;
    metadata: Event | null;
    replies: Event[];
    repliedTo?: Event[]
    type?: 'OP' | 'Reply' | 'Post';
}

const PostCard = ({
    key,
    event,
    metadata,
    replies,
    repliedTo,
    type
}: CardProps) => {
    const { files } = parseContent(event);
    const icon = getIconFromHash(event.pubkey);
    const metadataParsed = metadata ? getMetadata(metadata) : null;
    const [relatedEvents, setRelatedEvents] = useState<Event[]>([]);
    const [sumReplyPow, setReplySumPow] = useState(0);
    const [repostedEvent, setRepostedEvent] = useState<Event>();
    const [parsedEvent, setParsedEvent] = useState<Event>(event);
    const cachedMetadataEvents = JSON.parse(localStorage.getItem("cachedMetadataEvents") || "[]");

    useEffect(() => {
        const allRelatedEvents = [event, ...(replies || [])];
        setRelatedEvents(allRelatedEvents);

        if (event.kind === 6) {
            setRepostedEvent(event)
            setParsedEvent(JSON.parse(event.content));
        }

        // Adjusting the sum calculation to account for exponential growth in work
        const sum = replies.reduce((acc, reply) => {
            const difficulty = verifyPow(reply);
            // Skip adding to the sum if difficulty is 0, assuming 0 means no work was done.
            // Adjust this logic if verifyPow uses a different scale or interpretation.
            return difficulty > 0 ? acc + Math.pow(2, difficulty) : acc;
        }, 0);

        // Check if sum is greater than 0 to avoid -Infinity in log2 calculation
        const equivalentDifficulty = sum > 0 ? Math.log2(sum) : 0;
        setReplySumPow(equivalentDifficulty);
    }, [event, replies]);

    const handleClick = () => {
        if (type !== "OP") {
            sessionStorage.setItem("cachedThread", JSON.stringify(relatedEvents));
            window.location.href = `/thread/${nip19.noteEncode(parsedEvent.id)}`;
        }
    };

    return (
        <CardContainer>
            <div className={`flex flex-col gap-2`} key={key}>
                <div className={`flex flex-col break-words ${type !== "OP" ? 'hover:cursor-pointer' : ''}`} onClick={handleClick}>
                    <ContentPreview key={parsedEvent.id} eventdata={parsedEvent} />
                </div>
                <RenderMedia files={files} />
                {repliedTo && <div className="flex items-center mt-1" >
                    <span className="text-xs text-gray-500">Reply to: </span>
                    {uniqBy(repliedTo, 'pubkey').map((parsedEvent, index) => {
                        // Move the logic outside of the JSX return statement
                        const replyMetadata = cachedMetadataEvents.find((e: Event) => e.pubkey === parsedEvent.pubkey && e.kind === 0) || null;
                        return (
                            <div key={index}>
                                {replyMetadata ? (
                                    <img className={`h-5 w-5 rounded-full`} alt="icon" src={getMetadata(replyMetadata)?.picture} />
                                ) : (
                                    <div className={`h-4 w-4 ${getIconFromHash(parsedEvent.pubkey)} rounded-full`} />
                                )}
                            </div>
                        );
                    })}
                </div>}
                <div className={`pt-3 flex justify-between items-center ${type !== "OP" ? 'hover:cursor-pointer' : ''}`} onClick={handleClick}>
                    {metadataParsed ?
                        <img
                            key={key}
                            className="h-7 w-7 rounded-full object-cover"
                            src={metadataParsed?.picture ?? icon}
                            alt=""
                            loading="lazy"
                            decoding="async" />
                        :
                        <div className={`h-6 w-6 ${icon} rounded-full`} />
                    }
                    <div className="flex items-center ml-auto gap-2.5">
                        <div className={`inline-flex text-xs ${verifyPow(parsedEvent) === 0 ? 'text-neutral-600' : 'text-sky-800'} gap-0.5`}>
                            <CpuChipIcon className="h-4 w-4" /> {verifyPow(parsedEvent)}
                        </div>
                        {repostedEvent &&
                            <div className={`inline-flex text-xs ${verifyPow(repostedEvent) === 0 ? 'text-neutral-600' : 'text-sky-800'}`}>
                                + <CpuChipIcon className="h-4 w-4" />  {verifyPow(repostedEvent)}
                            </div>
                        }
                        <span className="text-neutral-700">·</span>
                        <div className="min-w-20 inline-flex items-center text-neutral-600">
                            <FolderIcon className="h-4 w-4" />
                            <span className="text-xs pl-1">{replies.length}</span>
                            (
                            <CpuChipIcon className={`h-4 w-4 ${sumReplyPow === 0 ? 'text-neutral-600' : 'text-sky-800'}`} />
                            <span className={`text-xs ${sumReplyPow === 0 ? 'text-neutral-600' : 'text-sky-800'}`}>{sumReplyPow.toFixed(0)}</span>)
                        </div>
                        <span className="text-neutral-700">·</span>
                        <div className="min-w-6 text-xs font-semibold text-neutral-600">
                            {timeAgo(event.created_at)}
                        </div>
                    </div>
                </div>
            </div>
        </CardContainer>
    );
};

export default PostCard;