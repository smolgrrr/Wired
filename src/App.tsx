import { BrowserRouter as Router } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { AppProviders } from "./app/providers";
import { AppRoutes } from "./app/routes";
import { Header } from "./shared/ui/Header";
import { NoiseOverlay } from "./shared/ui/NoiseOverlay";

function App() {
  return (
    <AppProviders>
      <NoiseOverlay />
      <Router>
        <Header />
        <AppRoutes />
        <Analytics />
        <SpeedInsights />
      </Router>
    </AppProviders>
  );
}

export default App;