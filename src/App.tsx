import { Routes, Route, Navigate } from 'react-router-dom';
import { RequireAdmin, RequireAuth } from './auth';
import { LoginPage } from './pages/Login';
import { DashboardPage } from './pages/Dashboard';
import { GamesPage } from './pages/Games';
import { GameDetailPage } from './pages/GameDetail';
import { EditionsPage } from './pages/Editions';
import { EditionNewPage } from './pages/EditionNew';
import { EditionDetailPage } from './pages/EditionDetail';
import { EventsPage } from './pages/Events';
import { EventNewPage } from './pages/EventNew';
import { EventDetailPage } from './pages/EventDetail';
import { EventRunPage } from './pages/EventRun';
import { EventLeaderboardPage } from './pages/EventLeaderboard';
import { PlayLeaderboardPage } from './pages/PlayLeaderboard';
import { LocationsPage } from './pages/Locations';
import { LocationDetailPage } from './pages/LocationDetail';
import { SettingsPage } from './pages/Settings';
import { UsersPage } from './pages/Users';
import { PlayEventPage } from './pages/PlayEvent';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<LoginPage />} />
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
            <EditionsPage />
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
  );
}
