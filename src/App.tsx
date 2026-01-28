import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { RequireAdmin, RequireAuth } from './auth';

const LoginPage = lazy(() => import('./pages/Login').then((mod) => ({ default: mod.LoginPage })));
const DashboardPage = lazy(() => import('./pages/Dashboard').then((mod) => ({ default: mod.DashboardPage })));
const GamesPage = lazy(() => import('./pages/Games').then((mod) => ({ default: mod.GamesPage })));
const GameDetailPage = lazy(() => import('./pages/GameDetail').then((mod) => ({ default: mod.GameDetailPage })));
const EditionNewPage = lazy(() => import('./pages/EditionNew').then((mod) => ({ default: mod.EditionNewPage })));
const EditionDetailPage = lazy(() => import('./pages/EditionDetail').then((mod) => ({ default: mod.EditionDetailPage })));
const EventsPage = lazy(() => import('./pages/Events').then((mod) => ({ default: mod.EventsPage })));
const EventNewPage = lazy(() => import('./pages/EventNew').then((mod) => ({ default: mod.EventNewPage })));
const EventDetailPage = lazy(() => import('./pages/EventDetail').then((mod) => ({ default: mod.EventDetailPage })));
const EventRunPage = lazy(() => import('./pages/EventRun').then((mod) => ({ default: mod.EventRunPage })));
const EventLeaderboardPage = lazy(() =>
  import('./pages/EventLeaderboard').then((mod) => ({ default: mod.EventLeaderboardPage }))
);
const PlayLeaderboardPage = lazy(() =>
  import('./pages/PlayLeaderboard').then((mod) => ({ default: mod.PlayLeaderboardPage }))
);
const LocationsPage = lazy(() => import('./pages/Locations').then((mod) => ({ default: mod.LocationsPage })));
const LocationDetailPage = lazy(() =>
  import('./pages/LocationDetail').then((mod) => ({ default: mod.LocationDetailPage }))
);
const InviteAcceptPage = lazy(() => import('./pages/InviteAccept').then((mod) => ({ default: mod.InviteAcceptPage })));
const SettingsPage = lazy(() => import('./pages/Settings').then((mod) => ({ default: mod.SettingsPage })));
const UsersPage = lazy(() => import('./pages/Users').then((mod) => ({ default: mod.UsersPage })));
const PlayEventPage = lazy(() => import('./pages/PlayEvent').then((mod) => ({ default: mod.PlayEventPage })));

const fallback = (
  <div className="min-h-screen bg-bg text-text">
    <div className="mx-auto flex min-h-[60vh] max-w-4xl items-center justify-center px-6">
      <div className="text-xs uppercase tracking-[0.3em] text-muted">Loading…</div>
    </div>
  </div>
);

export function App() {
  return (
    <Suspense fallback={fallback}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/invite/:token" element={<InviteAcceptPage />} />
        <Route path="/play/:code" element={<PlayEventPage />} />
        <Route path="/play/:code/leaderboard" element={<PlayLeaderboardPage />} />
        <Route
          path="/dashboard"
          element={
            <RequireAdmin>
              <DashboardPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/games"
          element={
            <RequireAdmin>
              <GamesPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/games/:gameId"
          element={
            <RequireAdmin>
              <GameDetailPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/editions"
          element={
            <RequireAdmin>
              <Navigate to="/games" replace />
            </RequireAdmin>
          }
        />
        <Route
          path="/editions/new"
          element={
            <RequireAdmin>
              <EditionNewPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/editions/:editionId"
          element={
            <RequireAdmin>
              <EditionDetailPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/events"
          element={
            <RequireAuth>
              <EventsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/events/new"
          element={
            <RequireAdmin>
              <EventNewPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/events/:eventId"
          element={
            <RequireAdmin>
              <EventDetailPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/events/:eventId/run"
          element={
            <RequireAuth>
              <EventRunPage />
            </RequireAuth>
          }
        />
        <Route
          path="/events/:eventId/leaderboard"
          element={
            <RequireAuth>
              <EventLeaderboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="/locations"
          element={
            <RequireAdmin>
              <LocationsPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/locations/:locationId"
          element={
            <RequireAdmin>
              <LocationDetailPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAdmin>
              <SettingsPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/settings/users"
          element={
            <RequireAdmin>
              <UsersPage />
            </RequireAdmin>
          }
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}
