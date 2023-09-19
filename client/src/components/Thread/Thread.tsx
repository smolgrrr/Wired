import { useParams } from 'react-router-dom';
import { useState } from "react";
import { Event } from "nostr-tools"
import { subNote } from '../../utils/subscriptions';
import { useEffect } from 'react';
import PostCard from '../PostCard/PostCard';

const Thread = () => {
    const { id } = useParams();
    const [events, setEvents] = useState<Event[]>([]); // Initialize state

    // Define your callback function for subGlobalFeed
    const onEvent = (event: Event, relay: string) => {
        setEvents((prevEvents) => [...prevEvents, event]);
        console.log(event.id + ' ' + event.kind + ' ' + event.tags);
    };

    useEffect(() => {
        // Subscribe to global feed when the component mounts
        subNote(id as string, onEvent);

        // Optionally, return a cleanup function to unsubscribe when the component unmounts
        return () => {
            // Your cleanup code here
        };
    }, []);  // Empty dependency array means this useEffect runs once when the component mounts

    return (
        <>
            <main className="bg-black text-white min-h-screen">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                    {events.sort((a, b) => b.created_at - a.created_at).map((event, index) => (
                        <PostCard key={index} event={event} />
                    ))}
                </div>
            </main>
        </>
    );
};

export default Thread;