import type {
  ApiEnvelope,
  EditionItem,
  Event,
  EventLiveState,
  EventRound,
  EventRoundScore,
  Game,
  GameEdition,
  GameType,
  Location,
  Team,
  User
} from './types';
import { createRequestId, logError, logInfo, logWarn } from './lib/log';

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<ApiEnvelope<T>> {
  const requestId = createRequestId();
  const method = (options.method ?? 'GET').toUpperCase();
  const start = performance.now();
  logInfo('api_request_start', { requestId, method, path });
  const res = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'x-request-id': requestId,
      ...(options.headers ?? {})
    }
  });

  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      logWarn('api_response_non_json', {
        requestId,
        method,
        path,
        status: res.status,
        body_snippet: text.slice(0, 200)
      });
    }
  }
  const durationMs = Math.round(performance.now() - start);
  const responseRequestId = res.headers.get('x-request-id');
  logInfo('api_request_end', {
    requestId,
    responseRequestId,
    method,
    path,
    status: res.status,
    ok: res.ok,
    durationMs
  });
  if (json && typeof json === 'object' && json !== null && 'ok' in json) {
    return json as ApiEnvelope<T>;
  }

  if (!res.ok) {
    logError('api_request_failed', {
      requestId,
      responseRequestId,
      method,
      path,
      status: res.status,
      body_snippet: text.slice(0, 200)
    });
    return { ok: false, error: { code: 'http_error', message: res.statusText, details: text.slice(0, 200) } };
  }

  return { ok: true, data: json as T };
}

export const api = {
  me: () => apiFetch<User>('/api/me'),
  login: (email: string, password: string) =>
    apiFetch<User>('/api/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    }),
  logout: () => apiFetch<{ ok: true }>('/api/logout', { method: 'POST' }),
  listGameTypes: () => apiFetch<GameType[]>('/api/game-types'),
  listHosts: () => apiFetch<User[]>('/api/hosts'),
  listUsers: () => apiFetch<User[]>('/api/users'),
  createUser: (payload: {
    email: string;
    password: string;
    username?: string;
    first_name?: string;
    last_name?: string;
    user_type: 'admin' | 'host' | 'player';
  }) => apiFetch<User>('/api/users', { method: 'POST', body: JSON.stringify(payload) }),
  updateUser: (id: string, payload: Partial<User> & { password?: string }) =>
    apiFetch<User>(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteUser: (id: string) => apiFetch<{ ok: true }>(`/api/users/${id}`, { method: 'DELETE' }),
  aiGenerate: (payload: { prompt: string; model?: string; max_output_tokens?: number }) =>
    apiFetch<{ text: string }>('/api/ai/generate', { method: 'POST', body: JSON.stringify(payload) }),
  aiImageAnswer: (payload: { media_key: string; prompt?: string }) =>
    apiFetch<{ answer: string }>('/api/ai/image-answer', { method: 'POST', body: JSON.stringify(payload) }),

  listLocations: () => apiFetch<Location[]>('/api/locations'),
  createLocation: (payload: Partial<Location>) =>
    apiFetch<Location>('/api/locations', { method: 'POST', body: JSON.stringify(payload) }),
  getLocation: (id: string) => apiFetch<Location>(`/api/locations/${id}`),
  updateLocation: (id: string, payload: Partial<Location>) =>
    apiFetch<Location>(`/api/locations/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteLocation: (id: string) => apiFetch<{ ok: true }>(`/api/locations/${id}`, { method: 'DELETE' }),

  listGames: () => apiFetch<Game[]>('/api/games'),
  createGame: (payload: Partial<Game>) =>
    apiFetch<Game>('/api/games', { method: 'POST', body: JSON.stringify(payload) }),
  getGame: (id: string) => apiFetch<Game>(`/api/games/${id}`),
  updateGame: (id: string, payload: Partial<Game>) =>
    apiFetch<Game>(`/api/games/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteGame: (id: string) => apiFetch<{ ok: true }>(`/api/games/${id}`, { method: 'DELETE' }),

  listEditions: (params?: { game_id?: string; status?: string; tag?: string; location_id?: string; search?: string }) => {
    const search = new URLSearchParams();
    if (params?.game_id) search.set('game_id', params.game_id);
    if (params?.status) search.set('status', params.status);
    if (params?.tag) search.set('tag', params.tag);
    if (params?.location_id) search.set('location_id', params.location_id);
    if (params?.search) search.set('search', params.search);
    const query = search.toString();
    return apiFetch<GameEdition[]>(`/api/editions${query ? `?${query}` : ''}`);
  },
  createEdition: (payload: Partial<GameEdition>) =>
    apiFetch<GameEdition>('/api/editions', { method: 'POST', body: JSON.stringify(payload) }),
  getEdition: (id: string) => apiFetch<GameEdition>(`/api/editions/${id}`),
  updateEdition: (id: string, payload: Partial<GameEdition>) =>
    apiFetch<GameEdition>(`/api/editions/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteEdition: (id: string) => apiFetch<{ ok: true }>(`/api/editions/${id}`, { method: 'DELETE' }),
  listEditionItems: (editionId: string) =>
    apiFetch<EditionItem[]>(`/api/editions/${editionId}/items`),
  createEditionItem: (editionId: string, payload: Partial<EditionItem>) =>
    apiFetch<EditionItem>(`/api/editions/${editionId}/items`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateEditionItem: (itemId: string, payload: Partial<EditionItem>) =>
    apiFetch<EditionItem>(`/api/edition-items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  deleteEditionItem: (itemId: string) =>
    apiFetch<{ ok: true }>(`/api/edition-items/${itemId}`, { method: 'DELETE' }),

  listEvents: () => apiFetch<Event[]>('/api/events'),
  createEvent: (payload: Partial<Event>) =>
    apiFetch<Event>('/api/events', { method: 'POST', body: JSON.stringify(payload) }),
  getEvent: (id: string) => apiFetch<Event>(`/api/events/${id}`),
  updateEvent: (id: string, payload: Partial<Event>) =>
    apiFetch<Event>(`/api/events/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteEvent: (id: string) => apiFetch<{ ok: true }>(`/api/events/${id}`, { method: 'DELETE' }),
  uploadEventDocument: async (eventId: string, type: 'scoresheet' | 'answersheet', file: File) => {
    const requestId = createRequestId();
    const start = performance.now();
    const res = await fetch(`/api/events/${eventId}/documents?type=${type}`, {
      method: 'POST',
      body: await file.arrayBuffer(),
      credentials: 'include',
      headers: {
        'x-request-id': requestId,
        'x-doc-type': type,
        'x-doc-filename': file.name || `${type}.pdf`,
        'Content-Type': file.type || 'application/pdf'
      }
    });
    const text = await res.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        logWarn('event_document_upload_non_json', { requestId, status: res.status, body_snippet: text.slice(0, 200) });
      }
    }
    const durationMs = Math.round(performance.now() - start);
    logInfo('event_document_upload_end', { requestId, status: res.status, ok: res.ok, durationMs });
    if (!res.ok) {
      logError('event_document_upload_failed', { requestId, status: res.status, body_snippet: text.slice(0, 200) });
    }
    return json as ApiEnvelope<Event>;
  },
  deleteEventDocument: (eventId: string, type: 'scoresheet' | 'answersheet') =>
    apiFetch<Event>(`/api/events/${eventId}/documents?type=${type}`, { method: 'DELETE' }),

  listEventRounds: (eventId: string) => apiFetch<EventRound[]>(`/api/events/${eventId}/rounds`),
  createEventRound: (eventId: string, payload: Partial<EventRound>) =>
    apiFetch<EventRound>(`/api/events/${eventId}/rounds`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateEventRound: (roundId: string, payload: Partial<EventRound>) =>
    apiFetch<EventRound>(`/api/event-rounds/${roundId}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  deleteEventRound: (roundId: string) =>
    apiFetch<{ ok: true }>(`/api/event-rounds/${roundId}`, { method: 'DELETE' }),
  listEventRoundItems: (roundId: string) =>
    apiFetch<EditionItem[]>(`/api/event-rounds/${roundId}/items`),
  getLiveState: (eventId: string) => apiFetch<EventLiveState | null>(`/api/events/${eventId}/live-state`),
  updateLiveState: (eventId: string, payload: Partial<EventLiveState>) =>
    apiFetch<EventLiveState>(`/api/events/${eventId}/live-state`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  listRoundScores: (roundId: string) =>
    apiFetch<EventRoundScore[]>(`/api/event-rounds/${roundId}/scores`),
  updateRoundScores: (roundId: string, scores: { team_id: string; score: number }[]) =>
    apiFetch<EventRoundScore[]>(`/api/event-rounds/${roundId}/scores`, {
      method: 'PUT',
      body: JSON.stringify({ scores })
    }),

  listTeams: (eventId: string) => apiFetch<Team[]>(`/api/events/${eventId}/teams`),
  createTeam: (eventId: string, payload: Partial<Team>) =>
    apiFetch<Team>(`/api/events/${eventId}/teams`, { method: 'POST', body: JSON.stringify(payload) }),
  updateTeam: (teamId: string, payload: Partial<Team>) =>
    apiFetch<Team>(`/api/teams/${teamId}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteTeam: (teamId: string) => apiFetch<{ ok: true }>(`/api/teams/${teamId}`, { method: 'DELETE' }),
  publicEvent: (code: string) => apiFetch<any>(`/api/public/event/${code}`, { cache: 'no-store' }),
  publicJoin: (code: string, payload: { team_id?: string; team_name?: string }) =>
    apiFetch<{ team: { id: string; name: string } }>(`/api/public/event/${code}/join`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  publicSubmitChoice: (code: string, payload: { team_id: string; item_id: string; choice_index: number }) =>
    apiFetch<{ ok: true; choice_index: number; choice_text: string }>(`/api/public/event/${code}/responses`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  uploadMedia: async (file: File, kind: 'image' | 'audio') => {
    const requestId = createRequestId();
    const start = performance.now();
    const res = await fetch('/api/media/upload', {
      method: 'POST',
      body: await file.arrayBuffer(),
      credentials: 'include',
      headers: {
        'x-request-id': requestId,
        'x-media-kind': kind,
        'x-media-filename': file.name || (kind === 'audio' ? 'upload.mp3' : 'upload.png'),
        'Content-Type': file.type || 'application/octet-stream'
      }
    });
    const text = await res.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        logWarn('media_upload_non_json', { requestId, status: res.status, body_snippet: text.slice(0, 200) });
      }
    }
    const durationMs = Math.round(performance.now() - start);
    logInfo('media_upload_end', { requestId, status: res.status, ok: res.ok, durationMs });
    if (!res.ok) {
      logError('media_upload_failed', { requestId, status: res.status, body_snippet: text.slice(0, 200) });
    }
    return json as ApiEnvelope<{ key: string; media_type: 'image' | 'audio'; content_type: string }>;
  },
  fetchMedia: async (key: string) => {
    const requestId = createRequestId();
    const start = performance.now();
    logInfo('media_fetch_start', { requestId, key });
    const res = await fetch(`/api/media/${encodeURI(key)}`, {
      method: 'GET',
      credentials: 'include',
      headers: { 'x-request-id': requestId }
    });
    const durationMs = Math.round(performance.now() - start);
    if (!res.ok) {
      const text = await res.text();
      logError('media_fetch_failed', {
        requestId,
        key,
        status: res.status,
        durationMs,
        body_snippet: text.slice(0, 200)
      });
      return { ok: false as const, error: { code: 'http_error', message: res.statusText, details: text.slice(0, 200) }, requestId };
    }
    const blob = await res.blob();
    logInfo('media_fetch_end', {
      requestId,
      key,
      status: res.status,
      durationMs,
      contentType: res.headers.get('content-type'),
      size: blob.size
    });
    return {
      ok: true as const,
      data: { blob, contentType: res.headers.get('content-type') },
      requestId
    };
  },
  deleteMedia: (key: string) =>
    apiFetch<{ ok: true }>(`/api/media/${encodeURI(key)}`, {
      method: 'DELETE'
    }),
  mediaUrl: (key: string) => `/api/media/${encodeURI(key)}`,
  publicMediaUrl: (code: string, key: string) =>
    `/api/public/event/${encodeURIComponent(code)}/media/${encodeURI(key)}`
};
