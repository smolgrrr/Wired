import { useParams } from 'react-router-dom';
import { useState } from "react";
import { Event, nip19 } from "nostr-tools"
import { subNotesOnce } from '../../utils/subscriptions';
import { useEffect } from 'react';
import { uniqBy } from '../../utils/otherUtils';
import { DocumentTextIcon, FolderPlusIcon, DocumentDuplicateIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import Placeholder from '../modals/Placeholder';
import NewNoteCard from '../forms/PostFormCard';
import RepostNote from '../forms/RepostNote';
import PostCard from '../modals/PostCard';
import { useFetchEvents } from '../../hooks/useFetchEvents';

type PostType = "" | "Reply" | "Quote" | undefined;

const Thread = () => {
    const { id } = useParams();
    const [showForm, setShowForm] = useState(false);
    const [showRepost, setShowRepost] = useState(false);
    const [postType, setPostType] = useState<PostType>("");
    const [prevMentions, setPrevMentions] = useState<Event[]>([]);
    // const filterDifficulty = useState(localStorage.getItem("filterDifficulty") || "20");
    let decodeResult = nip19.decode(id as string);
    let hexID = decodeResult.data as string;
    const { noteEvents, metadataEvents } = useFetchEvents(undefined,false,hexID);

    const countReplies = (event: Event) => {
        return noteEvents.filter(e => e.tags.some(tag => tag[0] === 'e' && tag[1] === event.id));
    }

    const repliedList = (event: Event): Event[] => {
        return noteEvents.filter(e => event.tags.some(tag => tag[0] === 'p' && tag[1] === e.pubkey));
    }


    // Define your callback function for subGlobalFeed
    const onEvent = (event: Event, relay: string) => {
        setPrevMentions((prevEvents) => [...prevEvents, event]);
    };

    const OPEvent = noteEvents.find(event => event.id === hexID);
    useEffect(() => {
        if (OPEvent && prevMentions.length == 0) {
            const OPMentionIDs = OPEvent.tags.filter(tag => tag[0] === 'e').map(tag => tag[1]);
            subNotesOnce(OPMentionIDs, onEvent);
        }
    }, [OPEvent]);

    if (OPEvent) {
        const uniqEvents = uniqBy(prevMentions, "id");
        const earlierEvents = uniqEvents
        .filter(e =>
            e.created_at < OPEvent.created_at
        )
    
        const replyEvents = [...noteEvents].slice(1)
        .filter(event => 
            !earlierEvents.map(e => e.id).includes(event.id) &&
            (OPEvent ? OPEvent.id !== event.id : true)
        ).sort((a, b) => a.created_at - b.created_at);
        
    return (
        <>
            <main className="bg-black text-white min-h-screen">
                <div className="w-full px-4 sm:px-0 sm:max-w-xl mx-auto my-2">
                    {earlierEvents
                        .filter(event => event.kind === 1)
                        .sort((a, b) => a.created_at - b.created_at).map((event, index) => (
                            <PostCard event={event} metadata={metadataEvents.find((e) => e.pubkey === event.pubkey && e.kind === 0) || null} replies={countReplies(event)} />
                        ))}
                    <PostCard event={OPEvent} metadata={metadataEvents.find((e) => e.pubkey === OPEvent.pubkey && e.kind === 0) || null} replies={countReplies(OPEvent)} type={'OP'}/>
                </div>
                <div className="col-span-full flex justify-center space-x-16 pb-4">
                    <DocumentTextIcon
                        className="h-5 w-5 text-gray-200 cursor-pointer"
                        onClick={() => {
                            setShowForm(prevShowForm => !prevShowForm);
                            setPostType('Reply');
                            setShowRepost(false)
                        }}
                    />
                    <DocumentDuplicateIcon
                        className="h-5 w-5 text-gray-200 cursor-pointer"
                        onClick={() => {
                            setShowRepost(prevShowRepost => !prevShowRepost);
                            setShowForm(false);
                        }}
                    />
                    <FolderPlusIcon
                        className="h-5 w-5 text-gray-200 cursor-pointer"
                        onClick={() => {
                            setShowForm(prevShowForm => !prevShowForm);
                            setPostType('Quote');
                            setShowRepost(false)
                        }}
                    />
                    <a href={`nostr:${id}`} target="_blank" rel="noopener noreferrer">
                        <ArrowTopRightOnSquareIcon
                            className="h-5 w-5 text-gray-200 cursor-pointer"
                        />
                    </a>
                </div>
                {(showForm && postType) && 
                <div className="w-full px-4 sm:px-0 sm:max-w-xl mx-auto my-2">
                    <div className='text-center'>
                    <span >{postType}-post</span>
                    </div>
                    <NewNoteCard refEvent={OPEvent} tagType={postType}/>
                </div>}
                {showRepost && OPEvent && <div className="w-full px-4 sm:px-0 sm:max-w-xl mx-auto my-2">
                    <div className='text-center'>
                    <span>Repost note</span>
                    </div>
                    <RepostNote refEvent={OPEvent}/>
                </div>}
                <div className="col-span-full h-0.5 bg-neutral-900"/> {/* This is the white line separator */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                    {replyEvents.map((event, index) => (
                        <PostCard 
                        key={index} 
                        event={event} 
                        metadata={metadataEvents.find((e) => e.pubkey === event.pubkey && e.kind === 0) || null} 
                        replies={replyEvents.filter((e) => e.tags.some((tag) => tag[0] === "e" && tag[1] === event.id))} 
                        repliedTo={repliedList(event)} 
                        />
                    ))}
                </div>
            </main>
        </>
    );
    }
    return (
        <>
            <Placeholder />
            <div className="col-span-full h-0.5 bg-neutral-900"/> {/* This is the white line separator */}
        </>
    );
};

export default Thread;