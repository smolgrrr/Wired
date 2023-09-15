import React from 'react';
import './App.css';
import Home from './components/Home';
import Settings from './components/Settings';
import SwipeableViews from 'react-swipeable-views';
import { NostrProvider } from './utils/relays';

const relayUrls = ['wss://relay.damus.io'];
function App() {
  const [index, setIndex] = React.useState(1);

  const handleChangeIndex = (index: number) => {
    console.log("Changed index to:", index);  // Add a log to see if this function is called
    setIndex(index);
  };

  return (
    <NostrProvider relayUrls={relayUrls} debug={true}>
      <SwipeableViews index={index} onChangeIndex={handleChangeIndex}>
        <div>
          <Settings />
        </div>
        <div>
          <Home />
        </div>
      </SwipeableViews>
    </NostrProvider>
  );
}

export default App;

