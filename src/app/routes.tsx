import { Navigate, Route, Routes } from "react-router-dom";
import FeedPage from "../features/feed/FeedPage";
import SettingsPage from "../features/settings/SettingsPage";
import ThreadPage from "../features/thread/ThreadPage";
import NotificationsPage from "../features/notifications/NotificationsPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/" element={<FeedPage />} />
      <Route path="/raw" element={<FeedPage mode="raw" />} />
      <Route path="/confess" element={<Navigate to="/" replace />} />
      <Route path="/thread/:id" element={<ThreadPage />} />
      <Route path="/notifications" element={<NotificationsPage />} />
    </Routes>
  );
}
