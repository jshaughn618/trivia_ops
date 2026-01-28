import type { Env } from '../types';
import { jsonError, jsonOk } from '../responses';
import { parseJson } from '../request';
import { inviteCreateSchema } from '../../shared/validators';
import { execute, nowIso, queryFirst } from '../db';
import { requireAdmin } from '../access';
import { sendInviteEmail } from '../_lib/zeptomail';

type InviteResult = {
  email: string;
  status: 'sent' | 'skipped' | 'failed';
  reason?: string;
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;

  const payload = await parseJson(request);
  const parsed = inviteCreateSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError({ code: 'validation_error', message: 'Invalid invite request', details: parsed.error.flatten() }, 400);
  }

  const role = parsed.data.role ?? 'host';
  const now = Date.now();
  const expiresAt = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
  const results: InviteResult[] = [];
  const baseUrl = env.APP_BASE_URL || new URL(request.url).origin;

  const seen = new Set<string>();
  for (const emailRaw of parsed.data.emails) {
    const email = emailRaw.trim().toLowerCase();
    if (!email) continue;
    if (seen.has(email)) continue;
    seen.add(email);

    const existingUser = await queryFirst<{ id: string }>(env, 'SELECT id FROM users WHERE email = ? AND COALESCE(deleted, 0) = 0', [
      email
    ]);
    if (existingUser) {
      results.push({ email, status: 'skipped', reason: 'User already exists' });
      continue;
    }

    await execute(
      env,
      'UPDATE invites SET revoked_at = ? WHERE email = ? AND used_at IS NULL AND revoked_at IS NULL',
      [nowIso(), email]
    );

    const token = crypto.randomUUID();
    const inviteId = crypto.randomUUID();
    await execute(
      env,
      `INSERT INTO invites (id, email, token, role, expires_at, used_at, revoked_at, created_at, created_by)
       VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
      [inviteId, email, token, role, expiresAt, nowIso(), data.user?.id ?? null]
    );

    const inviteUrl = `${baseUrl}/invite/${token}`;
    const sendRes = await sendInviteEmail(env, { to: email, inviteUrl });
    if (sendRes.ok) {
      results.push({ email, status: 'sent' });
    } else {
      results.push({ email, status: 'failed', reason: sendRes.error });
    }
  }

  return jsonOk({ results });
};
