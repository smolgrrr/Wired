import React from "react";
import "./App.css";
import Home from "./components/Home";
import Settings from "./components/Settings";
import SwipeableViews from "react-swipeable-views";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import Thread from "./components/Thread";
import Header from "./components/Header/Header";

function App() {
  const [index, setIndex] = React.useState(1);

  const handleChangeIndex = (index: number) => {
    console.log("Changed index to:", index); // Add a log to see if this function is called
    setIndex(index);
  };

  return (
    <Router>
      <Header />
      <Routes>
        <Route path="/settings" element={<Settings />} />
        <Route path="/home" element={<Home />} />
        <Route path="/thread/:id" element={<Thread />} />
        <Route
          path="/"
          element={
            <SwipeableViews
              index={index}
              onChangeIndex={handleChangeIndex}
              className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"
            >
              <Settings />
              <Home />
            </SwipeableViews>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
