import { FolderIcon, CpuChipIcon } from "@heroicons/react/24/outline";
// import { parseContent } from "../../utils/content";
import { Event, nip19 } from "nostr-tools";
import { getMetadata } from "../../utils/getMetadata";
// import { renderMedia } from "../../utils/FileUpload";
import { getIconFromHash, timeAgo } from "../../utils/cardUtils";
import { verifyPow } from "../../utils/mine";
import { uniqBy } from "../../utils/otherUtils";
import ContentPreview from "./CardModals/TextModal";
import CardContainer from "./CardContainer";
import { useState, useEffect } from "react";

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
    // const { files } = parseContent(event);
    const icon = getIconFromHash(event.pubkey);
    const metadataParsed = metadata ? getMetadata(metadata) : null;
    const [relatedEvents, setRelatedEvents] = useState<Event[]>([]);

    useEffect(() => {
        const allRelatedEvents = [event, ...(replies || [])];
        setRelatedEvents(allRelatedEvents);
    }, [event, replies]);

    const handleClick = () => {
        if (type !== "OP") {
            sessionStorage.setItem("cachedThread", JSON.stringify(relatedEvents));
            window.location.href = `/thread/${nip19.noteEncode(event.id)}`;
        }
    };

    return (
        <CardContainer>
                <div className={`flex flex-col gap-2`}>
                    <div className={`flex flex-col break-words ${type !== "OP" ? 'hover:cursor-pointer' : ''}`} onClick={handleClick}>
                        <ContentPreview key={event.id} eventdata={event} />
                    </div>
                    {repliedTo && <div className="flex items-center mt-1" >
                        <span className="text-xs text-gray-500">Reply to: </span>
                        {uniqBy(repliedTo, 'pubkey').map((event, index) => (
                            <div key={index}>
                                {event.kind === 0 ? (
                                    <img className={`h-5 w-5 rounded-full`} src={getMetadata(event)?.picture} />
                                ) : (
                                    <div className={`h-4 w-4 ${getIconFromHash(event.pubkey)} rounded-full`} />
                                )}
                            </div>
                        ))}
                    </div>}
                    <div className={`flex justify-between items-center ${type !== "OP" ? 'hover:cursor-pointer' : ''}`} onClick={handleClick}>
                            {metadataParsed ? 
                                <img
                                key = {key}
                                className={`h-5 w-5 rounded-full`}
                                src={metadataParsed?.picture ?? icon}
                                alt=""
                                loading="lazy"
                                decoding="async"/>
                                :
                                <div className={`h-4 w-4 ${icon} rounded-full`} />
                            }
                        <div className="flex items-center ml-auto gap-2.5">
                            <div className="inline-flex text-xs text-neutral-600 gap-0.5">
                                <CpuChipIcon className="h-4 w-4" /> {verifyPow(event)}
                            </div>
                            <span className="text-neutral-700">·</span>
                            <div className="text-xs font-semibold text-neutral-600">
                                {timeAgo(event.created_at)}
                            </div>
                            <span className="text-neutral-700">·</span>
                            <div className="inline-flex items-center gap-1">
                                <FolderIcon className="h-4 w-4 text-neutral-600" />
                                <span className="text-xs text-neutral-600">{replies.length}</span>
                            </div>
                        </div>
                    </div>
                </div>
        </CardContainer>
    );
};

export default PostCard;