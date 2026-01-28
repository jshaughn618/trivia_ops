import type { Env } from '../types';
import { logWarn } from './log';

const DEFAULT_ZEPTO_URL = 'https://api.zeptomail.com/v1.1/email';

type InviteEmail = {
  to: string;
  inviteUrl: string;
};

export async function sendInviteEmail(env: Env, { to, inviteUrl }: InviteEmail) {
  if (!env.ZEPTO_API_KEY || !env.ZEPTO_FROM) {
    logWarn(env, 'zepto_missing_config', { hasKey: Boolean(env.ZEPTO_API_KEY), hasFrom: Boolean(env.ZEPTO_FROM) });
    return { ok: false, error: 'ZeptoMail is not configured.' };
  }

  const payload = {
    from: {
      address: env.ZEPTO_FROM,
      name: env.ZEPTO_FROM_NAME || 'Trivia Ops'
    },
    to: [
      {
        email_address: {
          address: to
        }
      }
    ],
    subject: 'You are invited to Trivia Ops',
    textbody: `You have been invited to Trivia Ops.\n\nCreate your account:\n${inviteUrl}\n\nThis invite expires in 30 days.`,
    htmlbody: `<p>You have been invited to Trivia Ops.</p><p><a href="${inviteUrl}">Create your account</a></p><p>This invite expires in 30 days.</p>`
  };

  const res = await fetch(env.ZEPTO_API_URL ?? DEFAULT_ZEPTO_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Zoho-enczapikey ${env.ZEPTO_API_KEY}`
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text();
    logWarn(env, 'zepto_send_failed', { status: res.status, body: text.slice(0, 200) });
    return { ok: false, error: text || 'Failed to send invite.' };
  }

  return { ok: true };
}
