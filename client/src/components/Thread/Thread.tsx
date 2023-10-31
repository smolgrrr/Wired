import { useParams } from 'react-router-dom';
import { useState } from "react";
import { Event, nip19 } from "nostr-tools"
import { subNote, subNotesOnce } from '../../utils/subscriptions';
import { useEffect } from 'react';
import { uniqBy } from '../../utils/utils';
import { DocumentTextIcon, FolderPlusIcon } from '@heroicons/react/24/outline';
import { generatePrivateKey, getPublicKey, finishEvent } from 'nostr-tools';
import { minePow } from '../../utils/mine';
import { publish } from '../../utils/relays';
import ThreadPost from './ThreadPost';
import ReplyCard from './ReplyCard';
import OPCard from './OPCard';


const difficulty = 20

const Thread = () => {
    const { id } = useParams();
    const [events, setEvents] = useState<Event[]>([]); // Initialize state
    let decodeResult = nip19.decode(id as string);
    const [showForm, setShowForm] = useState(false);
    const [postType, setPostType] = useState("");
    const [hasRun, setHasRun] = useState(false);
    const [preOPEvents, setPreOPEvents] = useState(['']);

    // Define your callback function for subGlobalFeed
    const onEvent = (event: Event, relay: string) => {
        setEvents((prevEvents) => [...prevEvents, event]);
    };

    useEffect(() => {
        if (decodeResult.type === 'note') {
            let id_to_hex: string = decodeResult.data;
            // Call your subNote function or do whatever you need to do with id_to_hex
            subNote(id_to_hex, onEvent);
        }
        // Subscribe to global feed when the component mounts
        // Optionally, return a cleanup function to unsubscribe when the component unmounts

        return () => {
            // Your cleanup code here
        };
    }, []);  // Empty dependency array means this useEffect runs once when the component mounts

    const uniqEvents = events.length > 0 ? uniqBy(events, "id") : [];

    useEffect(() => {
        if (!hasRun && events.length > 0) {
            let OPNoteEvents = events[0].tags.filter(tag => tag[0] === 'e').map(tag => tag[1]);
            console.log(OPNoteEvents);
            setHasRun(true);
            setPreOPEvents(OPNoteEvents)
            subNotesOnce(OPNoteEvents, onEvent)
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
    )
    .sort((a, b) => (b.created_at as any) - (a.created_at as any));

    if (!uniqEvents[0]) {
        return (
            <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                    <div className="border border-blue-300 shadow rounded-md p-4 max-w-sm w-full mx-auto">
                        <div className="animate-pulse flex space-x-4">
                            <div className="rounded-full bg-slate-700 h-10 w-10"></div>
                            <div className="flex-1 space-y-6 py-1">
                                <div className="h-2 bg-slate-700 rounded"></div>
                                <div className="space-y-3">
                                    <div className="grid grid-cols-3 gap-4">
                                        <div className="h-2 bg-slate-700 rounded col-span-2"></div>
                                        <div className="h-2 bg-slate-700 rounded col-span-1"></div>
                                    </div>
                                    <div className="h-2 bg-slate-700 rounded"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </>
        );
    }
    return (
        <>
            <main className="bg-black text-white min-h-screen">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                        {earlierEvents
                            .filter(event => event.kind === 1)
                            .sort((a, b) => a.created_at - b.created_at).map((event, index) => (
                                <OPCard event={event} metadata={getMetadataEvent(event)} replyCount={countReplies(event)}/>
                            ))}
                    <OPCard event={uniqEvents[0]} metadata={getMetadataEvent(uniqEvents[0])} replyCount={countReplies(uniqEvents[0])} />
                    <div className="col-span-full flex justify-center space-x-36    ">
                        <DocumentTextIcon
                            className="h-5 w-5 text-gray-200"
                            onClick={() => {
                                setShowForm(prevShowForm => !prevShowForm);
                                setPostType('r');
                            }}
                        />

                        <FolderPlusIcon
                            className="h-5 w-5 text-gray-200"
                            onClick={() => {
                                setShowForm(prevShowForm => !prevShowForm);
                                setPostType('q');
                            }}
                        />
                    </div>
                    <div>
                        <ThreadPost OPEvent={uniqEvents[0]} state={showForm} type={postType} />
                    </div>
                    <div className="col-span-full h-0.5 bg-neutral-900"></div>  {/* This is the white line separator */}
                        {uniqEvents
                        .slice(1)
                        .filter(event => event.kind === 1)
                        .sort((a, b) => a.created_at - b.created_at).map((event, index) => (
                            <ReplyCard key={index} event={event} metadata={getMetadataEvent(event)} replyCount={countReplies(event)} repliedTo={repliedList(event)}/>
                        ))}
                </div>
            </main>
        </>
    );
};

export default Thread;