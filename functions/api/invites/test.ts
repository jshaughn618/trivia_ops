import type { Env } from '../../types';
import { jsonError, jsonOk } from '../../responses';
import { parseJson } from '../../request';
import { requireAdmin } from '../../access';
import { inviteDiagnosticSchema } from '../../../shared/validators';
import { sendInviteEmailDiagnostic } from '../../_lib/zeptomail';

export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const guard = requireAdmin(data.user ?? null);
  if (guard) return guard;

  const payload = await parseJson(request);
  const parsed = inviteDiagnosticSchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError(
      { code: 'validation_error', message: 'Invalid invite diagnostic request', details: parsed.error.flatten() },
      400
    );
  }

  const baseUrl = (env.APP_BASE_URL || new URL(request.url).origin).replace(/\/+$/, '');
  const inviteUrl = `${baseUrl}/invite/diagnostic-check`;
  const to = parsed.data.email.trim().toLowerCase();
  const result = await sendInviteEmailDiagnostic(env, { to, inviteUrl });

  return jsonOk({
    recipient: to,
    ok: result.ok,
    error: result.error ?? null,
    attempts: result.attempts
  });
};
