import React from 'react';
import './App.css';
import Home from './components/Home';
import Settings from './components/Settings';
import SwipeableViews from 'react-swipeable-views';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Thread from './components/Thread/Thread';
import { useState, useEffect } from 'react';

function App() {
  const [index, setIndex] = React.useState(1);

  const handleChangeIndex = (index: number) => {
    console.log("Changed index to:", index);  // Add a log to see if this function is called
    setIndex(index);
  };

  return (
    <Router>
      <Routes>
        <Route path="/settings" element={<Settings />} />
        <Route path="/home" element={<Home />} />
        <Route path='/thread/:id' element={<Thread />} />
        <Route path="/" element={
          <SwipeableViews index={index} onChangeIndex={handleChangeIndex}>
            <Settings />
            <Home />
          </SwipeableViews>
        } />
      </Routes>
    </Router>
  );
}

export default App;

