import type { Env } from '../../../types';
import { jsonError, jsonOk } from '../../../responses';
import { queryFirst } from '../../../db';

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  const token = params.token as string;
  const invite = await queryFirst<{
    email: string;
    role: string;
    expires_at: string;
    used_at: string | null;
    revoked_at: string | null;
  }>(
    env,
    'SELECT email, role, expires_at, used_at, revoked_at FROM invites WHERE token = ?',
    [token]
  );

  if (!invite) {
    return jsonError({ code: 'not_found', message: 'Invite not found' }, 404);
  }
  if (invite.revoked_at) {
    return jsonError({ code: 'invite_revoked', message: 'Invite has been revoked' }, 410);
  }
  if (invite.used_at) {
    return jsonError({ code: 'invite_used', message: 'Invite already used' }, 410);
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return jsonError({ code: 'invite_expired', message: 'Invite expired' }, 410);
  }

  return jsonOk({ email: invite.email, role: invite.role, expires_at: invite.expires_at });
};
