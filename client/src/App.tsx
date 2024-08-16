import "./styles/App.css";
import Home from "./components/routes/Home";
import Settings from "./components/routes/Settings";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import Thread from "./components/routes/Thread";
import Header from "./components/modals/Header";
import AddToHomeScreenPrompt from "./components/modals/CheckMobile/CheckMobile";
import Notifications from "./components/routes/Notifications";
import Hashtags from "./components/routes/Hashtags";
import HashtagPage from "./components/routes/HashtagPage";

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
