import "./styles/App.css";
import Home from "./components/Routes/Home";
import Settings from "./components/Routes/Settings";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import Thread from "./components/Routes/Thread";
import Header from "./components/Modals/Header";
import AddToHomeScreenPrompt from "./components/Modals/CheckMobile/CheckMobile";
import Notifications from "./components/Routes/Notifications";
import Hashtags from "./components/Routes/Hashtags";
import HashtagPage from "./components/Routes/HashtagPage";

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
      </Routes>
      <AddToHomeScreenPrompt/>
    </Router>
  );
}

export default App;
