import React, { useEffect, useState } from 'react';
import PostCard from './PostCard/PostCard';
import NewThreadCard from './PostCard/NewThreadCard';
import { getPow } from '../utils/mine';
import { relayInit, Event } from 'nostr-tools';
import { subGlobalFeed, simpleSub24hFeed } from '../utils/subscriptions';
import { uniqBy } from '../utils/utils';

const relay = relayInit('wss://nostr.lu.ke');

type EventRelayMap = {
  [eventId: string]: string[];
};
const eventRelayMap: EventRelayMap = {}; // eventId: [relay1, relay2]


const Home = () => {
  const [events, setEvents] = useState<Event[]>([]); // Initialize state

  // Define your callback function for subGlobalFeed
  const onEvent = (event: Event, relay: string) => {
    setEvents((prevEvents) => [...prevEvents, event]);
    console.log(event.id);
  };

  useEffect(() => {
    // Subscribe to global feed when the component mounts
    subGlobalFeed(onEvent);

    // Optionally, return a cleanup function to unsubscribe when the component unmounts
    return () => {
      // Your cleanup code here
    };
  }, []);  // Empty dependency array means this useEffect runs once when the component mounts

  const uniqEvents = events.length > 0 ? uniqBy(events, "id") : [];
  // const filteredEvents = uniqEvents.filter(event => getPow(event.id) > 5);
  const sortedEvents = uniqEvents.sort((a, b) => (b.created_at as any) - (a.created_at as any));

  return (
    <>
    <main className="bg-black text-white min-h-screen">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
        <NewThreadCard />
        {sortedEvents.sort((a, b) => b.created_at - a.created_at).map((event, index) => (
          <PostCard key={index} event={event}/>
        ))}
      </div>
    </main>
    {/* <Header /> */}
    </>
  );
};

export default Home;
