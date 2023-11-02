import CardContainer from '../PostCard/CardContainer'
import { FolderIcon } from '@heroicons/react/24/outline';
import { parseContent } from '../../utils/content';
import { Event } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import { getMetadata, uniqBy } from '../../utils/utils';
import ContentPreview from '../Modals/TextModal';
import { renderMedia } from '../../utils/FileUpload';
import { getIconFromHash } from '../../utils/deterministicProfileIcon';

const timeAgo = (unixTime: number) => {
    const seconds = Math.floor((new Date().getTime() / 1000) - unixTime);

    if (seconds < 60) return `now`;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;

    const weeks = Math.floor(days / 7);
    return `${weeks}w`;
};

const ReplyCard = ({ event, metadata, replyCount, repliedTo }: { event: Event, metadata: Event | null, replyCount: number, repliedTo: Event[] }) => {
    const { comment, file } = parseContent(event);
    const icon = getIconFromHash(event.pubkey);
    // const [events, setEvents] = useState<Event[]>([]);

    let metadataParsed = null;
    if (metadata !== null) {
        metadataParsed = getMetadata(metadata);
    }

    // const replyPubkeys = event.tags.filter(tag => tag[0] === 'p');


    return (
        <>
            <CardContainer>
                <a href={`/thread/${nip19.noteEncode(event.id)}`}>
                    <div className="flex flex-col">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center">
                                {metadataParsed ?
                                    <>
                                        <img className={`h-8 w-8 rounded-full`} src={metadataParsed.picture} />
                                        <div className="ml-2 text-md font-semibold">{metadataParsed.name}</div>
                                    </>
                                    :
                                    <>
                                        <div className={`h-8 w-8 ${icon} rounded-full`} />
                                        <div className="ml-2 text-md font-semibold">Anonymous</div>
                                    </>
                                }
                            </div>
                            <div className="flex items-center ml-auto gap-2.5">
                                <div className="text-xs font-semibold text-neutral-600">
                                    {timeAgo(event.created_at)}
                                </div>
                                <span className="text-neutral-700">·</span>
                                <div className="inline-flex items-center gap-1.5">
                                    <FolderIcon className="h-4 w-4 text-neutral-600" />
                                    <span className="text-xs text-neutral-600">{replyCount}</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center my-1" >
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
                        </div>
                        <div className="mr-2 flex flex-col break-words">
                            <ContentPreview key={event.id} comment={comment} />
                        </div>
                        {renderMedia(file)}
                    </div>
                </a>
            </CardContainer>
        </>
    );
};

export default ReplyCard;