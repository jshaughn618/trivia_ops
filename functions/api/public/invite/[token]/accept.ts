import type { Env } from '../../../../types';
import { jsonError, jsonOk } from '../../../../responses';
import { parseJson } from '../../../../request';
import { inviteAcceptSchema } from '../../../../../shared/validators';
import { execute, nowIso, queryFirst } from '../../../../db';
import { createSession, buildSessionCookie, hashPassword } from '../../../../auth';

export const onRequestPost: PagesFunction<Env> = async ({ env, params, request }) => {
  const token = params.token as string;
  const payload = await parseJson(request);
  const parsed = inviteAcceptSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid invite acceptance', details: parsed.error.flatten() }, 400);
  }

  const invite = await queryFirst<{
    id: string;
    email: string;
    role: string;
    expires_at: string;
    used_at: string | null;
    revoked_at: string | null;
  }>(
    env,
    'SELECT id, email, role, expires_at, used_at, revoked_at FROM invites WHERE token = ?',
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

  const existing = await queryFirst<{ id: string }>(
    env,
    'SELECT id FROM users WHERE email = ? AND COALESCE(deleted, 0) = 0',
    [invite.email]
  );
  if (existing) {
    return jsonError({ code: 'already_registered', message: 'Account already exists' }, 409);
  }

  const userId = crypto.randomUUID();
  const createdAt = nowIso();
  const passwordHash = await hashPassword(parsed.data.password);

  await execute(
    env,
    `INSERT INTO users (id, email, password_hash, created_at, username, first_name, last_name, user_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      invite.email,
      passwordHash,
      createdAt,
      parsed.data.username ?? null,
      parsed.data.first_name ?? null,
      parsed.data.last_name ?? null,
      invite.role ?? 'host'
    ]
  );

  await execute(
    env,
    'UPDATE invites SET used_at = ?, accepted_user_id = ? WHERE id = ?',
    [nowIso(), userId, invite.id]
  );

  const session = await createSession(env, userId, request);
  return jsonOk(
    {
      id: userId,
      email: invite.email,
      created_at: createdAt,
      username: parsed.data.username ?? null,
      first_name: parsed.data.first_name ?? null,
      last_name: parsed.data.last_name ?? null,
      user_type: invite.role as 'admin' | 'host' | 'player'
    },
    { headers: { 'Set-Cookie': buildSessionCookie(session.signed, session.expiresAt) } }
  );
};
