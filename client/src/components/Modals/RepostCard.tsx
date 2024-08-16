// import CardContainer from "./CardContainer";
import { CpuChipIcon } from "@heroicons/react/24/outline";
// import { parseContent } from "../../utils/content";
import { Event, nip19 } from "nostr-tools";
import { getMetadata, Metadata } from "../../utils/getMetadata";
import ContentPreview from "./CardModals/TextModal";
// import { renderMedia } from "../../utils/FileUpload";
import { getIconFromHash, timeAgo } from "../../utils/cardUtils";
import { verifyPow } from "../../utils/mine";
import { useNavigate } from 'react-router-dom';
import { subNoteOnce } from "../../utils/subscriptions";
import { useEffect, useState } from "react";

interface RepostProps {
    key?: string | number;
    event: Event;
}

const RepostCard = ({
    key,
    event
}: RepostProps) => {
    const repostedEvent = JSON.parse(event.content);
    // const { files } = parseContent(repostedEvent);
    const icon = getIconFromHash(event.pubkey);
    const navigate = useNavigate();
    const [cachedMetadataEvents, setCachedMetadataEvents] = useState<Event[]>(
        JSON.parse(localStorage.getItem("cachedMetadataEvents") || "[]")
      ); 
    const [metadata, setMetadata] = useState<Metadata>()

    // Define your callback function for subGlobalFeed
    const onEvent = (event: Event, relay: string) => {
        const existingEvent = cachedMetadataEvents.find((e) => e.pubkey === event.pubkey)
        if (existingEvent) {
            setMetadata(getMetadata(existingEvent))
        }
        else if (!existingEvent && event.kind === 0 && event.pubkey === repostedEvent.pubkey && metadata == null) {
            setMetadata(getMetadata(event))

            setCachedMetadataEvents((prevMetadataEvents) => {
                // Check if the event already exists in the cached metadata events
                const existingEvent = prevMetadataEvents.find((e) => e.id === event.id || e.pubkey === event.pubkey)
                if (!existingEvent) {
                  // If the event doesn't exist, add it to the cached metadata events
                  return [...prevMetadataEvents, event];
                } else if (existingEvent && existingEvent.created_at < event.created_at) {
                  // Remove any existing metadata event with the same pubkey and id
                  const updatedMetadataEvents = prevMetadataEvents.filter(
                    (e) => e.id !== existingEvent.id
                  );
                  // Add the new metadata event
                  return [...updatedMetadataEvents, event];
                }
                // If the event already exists, return the previous cached metadata events
                return prevMetadataEvents;
              });
        }
    };

    useEffect(() => {
        subNoteOnce(repostedEvent.id, onEvent);
    }, [repostedEvent.id]); 

    // Save the cached metadataEvents to localStorage
    useEffect(() => {
        localStorage.setItem("cachedMetadataEvents", JSON.stringify(cachedMetadataEvents));
    }, [cachedMetadataEvents]);

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