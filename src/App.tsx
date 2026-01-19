import { Routes, Route, Navigate } from 'react-router-dom';
import { RequireAuth } from './auth';
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
      <Route
        path="/dashboard"
        element={
          <RequireAuth>
            <DashboardPage />
          </RequireAuth>
        }
      />
      <Route
        path="/games"
        element={
          <RequireAuth>
            <GamesPage />
          </RequireAuth>
        }
      />
      <Route
        path="/games/:gameId"
        element={
          <RequireAuth>
            <GameDetailPage />
          </RequireAuth>
        }
      />
      <Route
        path="/editions"
        element={
          <RequireAuth>
            <EditionsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/editions/new"
        element={
          <RequireAuth>
            <EditionNewPage />
          </RequireAuth>
        }
      />
      <Route
        path="/editions/:editionId"
        element={
          <RequireAuth>
            <EditionDetailPage />
          </RequireAuth>
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
          <RequireAuth>
            <EventNewPage />
          </RequireAuth>
        }
      />
      <Route
        path="/events/:eventId"
        element={
          <RequireAuth>
            <EventDetailPage />
          </RequireAuth>
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
          <RequireAuth>
            <LocationsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/locations/:locationId"
        element={
          <RequireAuth>
            <LocationDetailPage />
          </RequireAuth>
        }
      />
      <Route
        path="/settings"
        element={
          <RequireAuth>
            <SettingsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/settings/users"
        element={
          <RequireAuth>
            <UsersPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
