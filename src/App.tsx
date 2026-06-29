import { useEffect } from "react";
import { BrowserRouter as Router, useLocation, useNavigationType } from "react-router-dom";
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

export function ScrollToTop() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType === "POP") {
      return;
    }

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [navigationType, pathname]);

  return null;
}

function App() {
  return (
    <AppProviders>
      <NoiseOverlay />
      <Router>
        <ScrollToTop />
        <Header />
        <AppRoutes />
        <Analytics />
        <AppSpeedInsights />
      </Router>
    </AppProviders>
  );
}

export default App;
