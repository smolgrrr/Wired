import "./styles/App.css";
import Home from "./Components/Routes/Home";
import Settings from "./Components/Routes/Settings";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import Thread from "./Components/Routes/Thread";
import Header from "./Components/Modals/Header";
import AddToHomeScreenPrompt from "./Components/Modals/CheckMobile/CheckMobile";
import Notifications from "./Components/Routes/Notifications";
import Hashtags from "./Components/Routes/Hashtags";
import HashtagPage from "./Components/Routes/HashtagPage";

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
