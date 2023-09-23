import { useParams } from 'react-router-dom';
import { useState } from "react";
import { Event, nip19 } from "nostr-tools"
import { subNote } from '../../utils/subscriptions';
import { useEffect } from 'react';
import PostCard from '../PostCard/PostCard';
import { uniqBy } from '../../utils/utils';
import OPPostCard from '../PostCard/OPPostCard';
import { DocumentTextIcon, FolderPlusIcon } from '@heroicons/react/24/outline';

const Thread = () => {
    const { id } = useParams();
    const [events, setEvents] = useState<Event[]>([]); // Initialize state
    let decodeResult = nip19.decode(id as string);


    // Define your callback function for subGlobalFeed
    const onEvent = (event: Event, relay: string) => {
        setEvents((prevEvents) => [...prevEvents, event]);
        console.log(event.id + ' ' + event.kind + ' ' + event.tags);
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

    if (!uniqEvents[0]) {
        return (
            <main className="bg-black text-white min-h-screen">
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
            </main>
        );
    }
    return (
        <>
            <main className="bg-black text-white min-h-screen">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                    <OPPostCard event={uniqEvents[0]} />
                    <div className="col-span-full flex justify-center space-x-36    ">
                        <DocumentTextIcon className="h-5 w-5 text-gray-200" />
                        <FolderPlusIcon className="h-5 w-5 text-gray-200" />
                    </div>
                    <div className="col-span-full h-0.5 bg-neutral-900"></div>  {/* This is the white line separator */}
                    {uniqEvents.sort((a, b) => b.created_at - a.created_at).map((event, index) => (
                        <PostCard key={index} event={event} />
                    ))}
                </div>
            </main>
        </>
    );
};

export default Thread;