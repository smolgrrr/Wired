import { useParams } from 'react-router-dom';
import { useState } from "react";
import { Event, nip19 } from "nostr-tools"
import { subNote, subNotesOnce } from '../utils/subscriptions';
import { useEffect } from 'react';
import { uniqBy } from '../utils/otherUtils';
import { DocumentTextIcon, FolderPlusIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline';
import { getPow } from '../utils/mine';
import PostCard from './Modals/NoteCard';
import Placeholder from './Modals/Placeholder';
import NewNoteCard from './Forms/PostFormCard';
import RepostNote from './Forms/RepostNote';

type PostType = "" | "Reply" | "Quote" | undefined;

const Thread = () => {
    const { id } = useParams();
    const [events, setEvents] = useState<Event[]>([]); // Initialize state
    const [OPEvent, setOPEvent] = useState<Event>()
    const [showForm, setShowForm] = useState(false);
    const [showRepost, setShowRepost] = useState(false);
    const [postType, setPostType] = useState<PostType>("");
    const [hasRun, setHasRun] = useState(false);
    const [preOPEvents, setPreOPEvents] = useState(['']);
    const [sortByTime, setSortByTime] = useState(true);
    const filterDifficulty = useState(localStorage.getItem("filterDifficulty") || "20");

    let decodeResult = nip19.decode(id as string);
    let hexID = decodeResult.data as string;

    // Define your callback function for subGlobalFeed
    const onEvent = (event: Event, relay: string) => {
        setEvents((prevEvents) => [...prevEvents, event]);
    };

    useEffect(() => {
        setHasRun(false)
        if (decodeResult.type === 'note') {
            // Call your subNote function or do whatever you need to do with id_to_hex
            subNote(hexID, onEvent);
        }

        return () => {
            // Your cleanup code here
        };
    }, [id]);  // Empty dependency array means this useEffect runs once when the component mounts

    const uniqEvents = events.length > 0 ? uniqBy(events, "id") : [];

    useEffect(() => {
        if (!hasRun && events.length > 0) {
            let OPEvent = uniqEvents[0];
            setOPEvent(OPEvent);
            
            if (OPEvent && OPEvent.id !== hexID) {
            OPEvent = events.find(e => e.id === hexID) as Event;
            }

            if (OPEvent) {
            setOPEvent(OPEvent);
            let OPNoteEvents = OPEvent.tags.filter(tag => tag[0] === 'e').map(tag => tag[1]);
            setHasRun(true);
            setPreOPEvents(OPNoteEvents)
            subNotesOnce(OPNoteEvents, onEvent)
            }
        }
    }, [uniqEvents, hasRun]);

    const getMetadataEvent = (event: Event) => {
        const metadataEvent = uniqEvents.find(e => e.pubkey === event.pubkey && e.kind === 0);
        if (metadataEvent) {
            return metadataEvent;
        }
        return null;
    }

    const countReplies = (event: Event) => {
        return uniqEvents.filter(e => e.tags.some(tag => tag[0] === 'e' && tag[1] === event.id)).length;
    }

    const repliedList = (event: Event): Event[] => {
        return uniqEvents.filter(e => event.tags.some(tag => tag[0] === 'p' && tag[1] === e.pubkey));
    }

    const earlierEvents = uniqEvents
    .filter(event =>
            event.kind === 1 &&
            preOPEvents.includes(event.id)
    ).sort((a, b) => (b.created_at as any) - (a.created_at as any));

    const toggleSort = () => {
        setSortByTime(prev => !prev);
    };

    const eventsSortedByTime = [...uniqEvents].slice(1)
    .filter(event => 
        event.kind === 1 &&
        !earlierEvents.map(e => e.id).includes(event.id) &&
        (OPEvent ? OPEvent.id !== event.id : true)
    ).sort((a, b) => a.created_at - b.created_at);

    // Events sorted by PoW (assuming `getPow` returns a numerical representation of the PoW)
    const eventsSortedByPow = [...uniqEvents].slice(1)
        .filter((event) =>
            getPow(event.id) > Number(filterDifficulty) &&
            event.kind === 1 &&
            !earlierEvents.map(e => e.id).includes(event.id) &&
            (OPEvent ? OPEvent.id !== event.id : true)
        ).sort((a, b) => getPow(b.id) - getPow(a.id));

    const displayedEvents = sortByTime ? eventsSortedByTime : eventsSortedByPow;

    if (!uniqEvents[0]) {
        return (
            <Placeholder />
        );
    }
    return (
        <>
            <main className="bg-black text-white min-h-screen">
                <div className="w-full px-4 sm:px-0 sm:max-w-xl mx-auto my-2">
                    {earlierEvents
                        .filter(event => event.kind === 1)
                        .sort((a, b) => a.created_at - b.created_at).map((event, index) => (
                            <PostCard event={event} metadata={getMetadataEvent(event)} replyCount={countReplies(event)} />
                        ))}
                    {OPEvent && <PostCard event={OPEvent} metadata={getMetadataEvent(OPEvent)} replyCount={countReplies(OPEvent)} type={'OP'}/>}
                </div>
                <div className="col-span-full flex justify-center space-x-36">
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
                </div>
                {(showForm && postType) && 
                <div className="w-full px-4 sm:px-0 sm:max-w-xl mx-auto my-2">
                    <span className='text-center'>{postType}-post</span>
                    <NewNoteCard refEvent={uniqEvents[0]} tagType={postType}/>
                </div>}
                {showRepost && <div className="w-full px-4 sm:px-0 sm:max-w-xl mx-auto my-2">
                    <span className='text-center'>Repost note</span>
                    <RepostNote refEvent={uniqEvents[0]}/>
                </div>}
                <div className="flex items-center justify-center w-full py-4">
                    <label htmlFor="toggleB" className="flex items-center cursor-pointer">
                        <div className="relative">
                            <input
                                id="toggleB"
                                type="checkbox"
                                className="sr-only"
                                checked={sortByTime}
                                onChange={toggleSort}
                            />
                            <div className="block bg-gray-600 w-10 h-6 rounded-full"></div>
                            <div
                                className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition ${sortByTime ? 'transform translate-x-full bg-blue-400' : ''
                                    }`}
                            ></div>
                        </div>
                        <div className={`ml-3 text-neutral-500 font-medium ${sortByTime ? 'text-neutral-500' : ''}`}>
                            {sortByTime ? 'Sort by oldest' : 'Sort by PoW'}
                        </div>
                    </label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                    <div className="col-span-full h-0.5 bg-neutral-900"></div>  {/* This is the white line separator */}
                    {displayedEvents.map((event, index) => (
                        <PostCard key={index} event={event} metadata={getMetadataEvent(event)} replyCount={countReplies(event)} repliedTo={repliedList(event)} />
                    ))}
                </div>
            </main>
        </>
    );
};

export default Thread;