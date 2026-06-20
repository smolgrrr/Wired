import { BrowserRouter as Router, useLocation } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { AppProviders } from "./app/providers";
import { AppRoutes } from "./app/routes";
import { Header } from "./shared/ui/Header";
import { NoiseOverlay } from "./shared/ui/NoiseOverlay";
import { getPathDisplay } from "./shared/ui/routeLabelMap";

function AppSpeedInsights() {
  const { pathname } = useLocation();
  return <SpeedInsights route={getPathDisplay(pathname)} />;
}

function App() {
  return (
    <AppProviders>
      <NoiseOverlay />
      <Router>
        <Header />
        <AppRoutes />
        <Analytics />
        <AppSpeedInsights />
      </Router>
    </AppProviders>
  );
}

export default App;