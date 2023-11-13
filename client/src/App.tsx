import "./App.css";
import Home from "./components/Home";
import Settings from "./components/Settings";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import Thread from "./components/Thread";
import Header from "./components/Header/Header";

function App() {

  return (
    <Router>
      <Header />
      <Routes>
        <Route path="/settings" element={<Settings />} />
        <Route path="/" element={<Home />} />
        <Route path="/thread/:id" element={<Thread />} />
      </Routes>
    </Router>
  );
}

export default App;
