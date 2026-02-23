import type { Env } from '../../../types';
import { requireEventAccess, requireHostOrAdmin } from '../../../access';
import { queryFirst } from '../../../db';
import { createParticipantDisplayToken } from '../../../participant-display';
import { jsonError, jsonOk } from '../../../responses';

function resolveBaseUrl(env: Env, request: Request) {
  const configured = (env.APP_BASE_URL || '').trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Ignore malformed APP_BASE_URL and fall back to request origin.
    }
  }
  return new URL(request.url).origin;
}

export const onRequestPost: PagesFunction<Env> = async ({ env, params, data, request }) => {
  const roleGuard = requireHostOrAdmin(data.user ?? null);
  if (roleGuard) return roleGuard;

  const eventId = String(params.id ?? '').trim();
  if (!eventId) {
    return jsonError({ code: 'validation_error', message: 'Event id is required' }, 400);
  }

  const access = await requireEventAccess(env, data.user ?? null, eventId);
  if (access.response) return access.response;

  const event = await queryFirst<{ id: string; public_code: string | null }>(
    env,
    'SELECT id, public_code FROM events WHERE id = ? AND COALESCE(deleted, 0) = 0',
    [eventId]
  );
  if (!event) {
    return jsonError({ code: 'not_found', message: 'Event not found' }, 404);
  }
  if (!event.public_code) {
    return jsonError({ code: 'validation_error', message: 'Event must have a public code before sharing display view.' }, 400);
  }

  const { token, expiresAt } = await createParticipantDisplayToken(env, event.public_code);
  const baseUrl = resolveBaseUrl(env, request);
  const url = `${baseUrl}/play/${encodeURIComponent(event.public_code)}/display?token=${encodeURIComponent(token)}`;

  return jsonOk({
    url,
    token,
    public_code: event.public_code,
    expires_at: expiresAt
  });
};
