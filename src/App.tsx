import { BrowserRouter as Router } from "react-router-dom";
import { AppProviders } from "./app/providers";
import { AppRoutes } from "./app/routes";
import { Header } from "./shared/ui/Header";

function App() {
  return (
    <AppProviders>
      <Router>
        <Header />
        <AppRoutes />
      </Router>
    </AppProviders>
  );
}

export default App;