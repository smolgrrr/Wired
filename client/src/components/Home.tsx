import React, { useEffect, useState } from 'react';
import { relayInit } from 'nostr-tools';
import PostCard from './PostCard/PostCard';
import Header from './Header/Header';
import NewThreadCard from './PostCard/NewThreadCard';
import { getPow } from '../utils/mine';
import { Event } from 'nostr-tools';

const relay = relayInit('wss://nostr.lu.ke');

const Home = () => {
  // Define the type of the state variable
  const [events, setEvents] = useState<Event[]>([]);

  useEffect(() => {
    relay.on('connect', async () => {
      console.log(`connected to ${relay.url}`);

      const eventList = await relay.list([
        {
          kinds: [1],
          limit: 200,
        },
      ]);

      // Filter events with a difficulty greater than 10
      const filteredEvents = eventList.filter(event => getPow(event.id) > 2);

      // Assuming eventList is of type Event[]
      setEvents(filteredEvents);
    });

    relay.on('error', () => {
      console.log(`failed to connect to ${relay.url}`);
    });

    relay.connect();
  }, []);

  return (
    <>
    <main className="bg-black text-white min-h-screen">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
        <NewThreadCard />
        {events.sort((a, b) => b.created_at - a.created_at).map((event, index) => (
          <PostCard key={index} event={event}/>
        ))}
      </div>
    </main>
    {/* <Header /> */}
    </>
  );
};

export default Home;
