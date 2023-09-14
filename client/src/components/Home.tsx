import React, { useEffect, useState } from 'react';
import { relayInit } from 'nostr-tools';
import PostCard from './PostCard/PostCard';
import Header from './Header/Header';
import NewThreadCard from './PostCard/NewThreadCard';

// Define the Event interface
interface Event {
  id: string;
  content: string;
  created_at: number;
  // Add other fields if necessary
}

const relay = relayInit('wss://nostr.lu.ke');

const Home = () => {
  // Define the type of the state variable
  const [events, setEvents] = useState<Event[]>([]);

  useEffect(() => {
    relay.on('connect', async () => {
      console.log(`connected to ${relay.url}`);

      const eventList = await relay.list([
        {
          ids: ['00'],
          kinds: [1],
          limit: 10,
        },
      ]);

      // Assuming eventList is of type Event[]
      setEvents(eventList);
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
        {events.sort((a, b) => a.created_at - b.created_at).map((event, index) => (
          <PostCard key={index} content={event.content} />
        ))}
      </div>
    </main>
    {/* <Header /> */}
    </>
  );
};

export default Home;
