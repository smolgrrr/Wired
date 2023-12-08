import CardContainer from "./CardContainer";
import { CpuChipIcon, ArrowPathRoundedSquareIcon } from "@heroicons/react/24/outline";
import { parseContent } from "../../utils/content";
import { Event as NostrEvent, nip19 } from "nostr-tools";
import { getMetadata, Metadata } from "../../utils/otherUtils";
import ContentPreview from "./CardModals/TextModal";
import { renderMedia } from "../../utils/FileUpload";
import { getIconFromHash, timeAgo } from "../../utils/cardUtils";
import { verifyPow } from "../../utils/mine";
import { useNavigate } from 'react-router-dom';
import { subNoteOnce } from "../../utils/subscriptions";
import { useEffect, useState } from "react";

interface RepostProps {
    key?: string | number;
    event: NostrEvent;
}

const RepostCard = ({
    key,
    event
}: RepostProps) => {
    const repostedEvent = JSON.parse(event.content);
    const { files } = parseContent(event);
    const icon = getIconFromHash(event.pubkey);
    const navigate = useNavigate();
    const [metadata, setMetadata] = useState<Metadata>()

    // Define your callback function for subGlobalFeed
    const onEvent = (event: NostrEvent, relay: string) => {
        if (event.kind === 0 && event.pubkey === repostedEvent.pubkey) {
            setMetadata(getMetadata(event))
        }
    };

    useEffect(() => {
        subNoteOnce(repostedEvent.id, onEvent);
    }, [repostedEvent.id]); 

    const handleClick = () => {
        navigate(`/thread/${nip19.noteEncode(repostedEvent.id)}`);
    };

    return (
        <div>

            <div className="ml-1 flex text-sm text-neutral-600 gap-2.5">
                Repost
                @
                <span className="inline-flex"><CpuChipIcon className="h-5 w-5" /> {verifyPow(event)}</span>
            </div>
            <div className="rounded-lg border border-neutral-700">
                <div className="card break-inside-avoid h-min">
                    <div className="card-body">
                        <div className={`flex flex-col gap-2`}>
                            <div className={`flex flex-col break-words hover:cursor-pointer`} onClick={handleClick}>
                                <ContentPreview key={repostedEvent.id} eventdata={repostedEvent} />
                            </div>
                            {renderMedia(files)}
                            <div className={`flex justify-between items-center hover:cursor-pointer`} onClick={handleClick}>
                                {metadata ? 
                                    <img
                                    key = {key}
                                    className={`h-5 w-5 rounded-full`}
                                    src={metadata?.picture ?? icon}
                                    alt=""
                                    loading="lazy"
                                    decoding="async"/>
                                    :
                                    <div className={`h-4 w-4 ${icon} rounded-full`} />
                                }
                                <div className="flex items-center ml-auto gap-2.5">
                                    <div className="inline-flex text-xs text-neutral-600 gap-0.5">
                                        <CpuChipIcon className="h-4 w-4" /> {verifyPow(repostedEvent)}
                                    </div>
                                    <span className="text-neutral-700">·</span>
                                    <div className="text-xs font-semibold text-neutral-600">
                                        {timeAgo(repostedEvent.created_at)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RepostCard;