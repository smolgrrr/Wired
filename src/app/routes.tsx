import { lazy, Suspense } from "react";
import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import FeedPage from "../features/feed/FeedPage";
import ThreadPage from "../features/thread/ThreadPage";

const SettingsPage = lazy(() => import("../features/settings/SettingsPage"));
const NotificationsPage = lazy(() => import("../features/notifications/NotificationsPage"));

function LazyRoute({ children }: { children: ReactNode }) {
  return <Suspense fallback={null}>{children}</Suspense>;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/settings"
        element={
          <LazyRoute>
            <SettingsPage />
          </LazyRoute>
        }
      />
      <Route path="/" element={<FeedPage />} />
      <Route path="/raw" element={<FeedPage mode="raw" />} />
      <Route path="/confess" element={<Navigate to="/" replace />} />
      <Route path="/thread/:id" element={<ThreadPage />} />
      <Route
        path="/notifications"
        element={
          <LazyRoute>
            <NotificationsPage />
          </LazyRoute>
        }
      />
    </Routes>
  );
}
