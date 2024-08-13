import "./App.css";
import Home from "./components/Home";
import Settings from "./components/Settings";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import Thread from "./components/Thread";
import Header from "./components/Header/Header";
import AddToHomeScreenPrompt from "./components/Modals/CheckMobile/CheckMobile";
import Notifications from "./components/Notifications";
// import TestUI from "./components/TestUI";
import Hashtags from "./components/Hashtags";
import HashtagPage from "./components/HashtagPage";

function App() {
  return (
    <Router>
      <Header />
      <Routes>
        <Route path="/settings" element={<Settings />} />
        <Route path="/" element={<Home />} />
        <Route path="/thread/:id" element={<Thread />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/hashtags" element={<Hashtags />} />
        <Route path="/hashtag/:id" element={<HashtagPage />} />
        {/* <Route path="/test" element={<TestUI />} /> */}
      </Routes>
      <AddToHomeScreenPrompt/>
    </Router>
  );
}

export default App;
