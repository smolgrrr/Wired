import CardContainer from "./CardContainer";
import { FolderIcon, CpuChipIcon } from "@heroicons/react/24/outline";
import { parseContent } from "../../utils/content";
import { Event, nip19 } from "nostr-tools";
import { getMetadata } from "../../utils/utils";
import ContentPreview from "./TextModal";
import { renderMedia } from "../../utils/FileUpload";
import { getIconFromHash } from "../../utils/deterministicProfileIcon";
import { verifyPow } from "../../utils/mine";
import { uniqBy } from "../../utils/utils";
import { useNavigate } from 'react-router-dom';

const timeUnits = [
    { unit: 'w', value: 60 * 60 * 24 * 7 },
    { unit: 'd', value: 60 * 60 * 24 },
    { unit: 'h', value: 60 * 60 },
    { unit: 'm', value: 60 },
];

const timeAgo = (unixTime: number) => {
    let seconds = Math.floor(new Date().getTime() / 1000 - unixTime);

    if (seconds < 60) return `now`;

    for (let unit of timeUnits) {
        if (seconds >= unit.value) {
            return `${Math.floor(seconds / unit.value)}${unit.unit}`;
        }
        seconds %= unit.value;
    }
};

interface CardProps {
    key?: string | number;
    event: Event;
    metadata: Event | null;
    replyCount: number;
    repliedTo?: Event[]
    type?: 'OP' | 'Reply' | 'Post';
}

const PostCard = ({
    key,
    event,
    metadata,
    replyCount,
    repliedTo,
    type
}: CardProps) => {
    const { comment, file } = parseContent(event);
    const icon = getIconFromHash(event.pubkey);
    const metadataParsed = metadata ? getMetadata(metadata) : null;
    const navigate = useNavigate();

    const handleClick = () => {
        if (type !== "OP") {
            navigate(`/thread/${nip19.noteEncode(event.id)}`);
        }
    };

    return (
        <CardContainer>
                <div className={`flex flex-col gap-2 ${type !== "OP" ? 'hover:cursor-pointer' : ''}`} onClick={handleClick}>
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2.5">
                            {metadataParsed ? 
                                <img
                                className={`h-8 w-8 rounded-full`}
                                src={metadataParsed?.picture ?? icon}
                                alt=""
                                loading="lazy"
                                decoding="async"/>
                                :
                                <div className={`h-7 w-7 ${icon} rounded-full`} />
                            }
                            <div className="text-md font-semibold">
                                {metadataParsed?.name ?? 'Anonymous'}
                            </div>
                        </div>
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
                                <span className="text-xs text-neutral-600">{replyCount}</span>
                            </div>
                        </div>
                    </div>
                    {repliedTo && <div className="flex items-center my-1" >
                        <span className="text-xs text-gray-500">Reply to: </span>
                        {uniqBy(repliedTo, 'pubkey').map((event, index) => (
                            <div key={index}>
                                {event.kind == 0 ? (
                                    <img className={`h-5 w-5 rounded-full`} src={getMetadata(event)?.picture} />
                                ) : (
                                    <div className={`h-5 w-5 ${getIconFromHash(event.pubkey)} rounded-full`} />
                                )}
                            </div>
                        ))}
                    </div>}
                    <div className="flex flex-col break-words">
                        <ContentPreview key={event.id} comment={comment} />
                    </div>
                </div>
            {renderMedia(file)}
        </CardContainer>
    );
};

export default PostCard;