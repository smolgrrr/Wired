import React, { useEffect, useState } from 'react';
import PostCard from './PostCard/PostCard';
import NewThreadCard from './PostCard/NewThreadCard';
import { getPow } from '../utils/mine';
import { relayInit, Event } from 'nostr-tools';
import { subGlobalFeed, simpleSub24hFeed } from '../utils/subscriptions';
import { uniqBy } from '../utils/utils';

const Home = () => {
  const [events, setEvents] = useState<Event[]>([]); // Initialize state

  // Define your callback function for subGlobalFeed
  const onEvent = (event: Event, relay: string) => {
    setEvents((prevEvents) => [...prevEvents, event]);
    console.log(event.id + ' ' + event.kind + ' ' + event.tags);
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
  const filteredEvents1 = uniqEvents.filter(event => getPow(event.id) > 3);
  const filteredEvents2 = filteredEvents1.filter(event => event.kind == 1);
  const filteredEvents3 = filteredEvents2.filter(event => 
    !event.tags.some(tag => tag[0] === 'p')
  );
  const sortedEvents = filteredEvents3.sort((a, b) => (b.created_at as any) - (a.created_at as any));

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
