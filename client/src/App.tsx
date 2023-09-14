import React from 'react';
import logo from './logo.svg';
import './App.css';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './components/Home';

declare global {
  interface Window {
    nostr?: any;
  }
}

function App() {
  return (
    <Router>
    <div>
        <Routes>
          <Route path="/" element={<Home />} />
        </Routes>
    </div>
    </Router>
  );
}

export default App;
