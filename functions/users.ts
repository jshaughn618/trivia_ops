import { jsonError } from './responses';
import type { Env } from './types';

export function requireAdmin(env: Env, user: { user_type: string }) {
  if (user.user_type !== 'admin') {
    return jsonError({ code: 'forbidden', message: 'Admin access required' }, 403);
  }
  return null;
}
