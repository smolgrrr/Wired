import React, { useEffect, useState } from 'react';
import { relayInit } from 'nostr-tools';
import PostCard from './PostCard/PostCard';
import Header from './Header/Header';
import NewThreadCard from './PostCard/NewThreadCard';

let filterDifficulty: number = 1;

// Define the Event interface
interface Event {
  id: string;
  content: string;
  created_at: number;
  // Add other fields if necessary
}

const relay = relayInit('wss://relay.damus.io');

const Home = () => {
  // Define the type of the state variable
  const [events, setEvents] = useState<Event[]>([]);

  useEffect(() => {
    relay.on('connect', async () => {
      console.log(`connected to ${relay.url}`);
      console.log(Math.floor(Date.now() - (30 * 24 * 60 * 60 * 1000)))

      // Pad the ID with leading zeros based on filterDifficulty
      const paddedId = "0".padStart(filterDifficulty + 1, '0'); 
      console.log(paddedId);

      const eventList = await relay.list([
        {
          ids: ['00'], //prefix number of leading zeros from filterDifficulty
          kinds: [1],
          //until: Date.now(),
          limit: 10,
          //since: Math.floor(Date.now() - (30 * 24 * 60 * 60 * 1000)), // 24 hours ago
        },
      ]);
    // const socket = new WebSocket('wss://relay.damus.io');
    //  socket.onopen = () => {
    //    console.log('WebSocket connected');
    //    const subscription = [
    //      'REQ',
    //      'POW-TEST',
    //      {
    //        ids: ["0000"],
    //        limit: 10,
    //      },
    //    ];
    //    socket.send(JSON.stringify(subscription));
    //  };

    //  let i = 0;
    //  let start = Date.now();
    //  socket.onmessage = event => {
    //   console.log(event.data);
    //  };
    //  socket.onerror = error => {
    //    console.error('WebSocket error:', error);
    //  };

      // Assuming eventList is of type Event[]
      setEvents(eventList);
      console.log(eventList);
    });

    relay.on('error', () => {
      console.log(`failed to connect to ${relay.url}`);
    });

    relay.connect();
  }, []);

  return (
    <>
    <main className="bg-gray-950 text-white min-h-screen">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
        <NewThreadCard />
        {events.map((event, index) => (
          <PostCard key={index} content={event.content} time={new Date(event.created_at * 1000)} />
        ))}
      </div>
    </main>
    <Header />
    </>
  );
};

export default Home;
