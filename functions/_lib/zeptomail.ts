import type { Env } from '../types';
import { logWarn } from './log';

const DEFAULT_ZEPTO_URL = 'https://api.zeptomail.com/v1.1/email';

type InviteEmail = {
  to: string;
  inviteUrl: string;
};

function buildPayload(to: string, inviteUrl: string, includeHtml: boolean) {
  const textbody = `You have been invited to host for Trivia Ops.\n\nCreate your account:\n${inviteUrl}\n\nThis invite expires in 30 days.\n\nJacob\nFounder, triviaops.com`;
  const payload: Record<string, unknown> = {
    to: [
      {
        email_address: {
          address: to
        }
      }
    ],
    subject: 'You are invited to Trivia Ops',
    textbody
  };
  if (includeHtml) {
    payload.htmlbody = `<div style="font-family: Arial, sans-serif; color: #111;">
      <p>You have been invited to host for Trivia Ops.</p>
      <p><a href="${inviteUrl}">Create your account</a></p>
      <p>This invite expires in 30 days.</p>
      <p style="margin-top: 24px;">Jacob<br/>Founder, triviaops.com</p>
    </div>`;
  }
  return payload;
}

function extractErrorMessage(text: string, fallback: string) {
  if (!text.trim()) return fallback;
  try {
    const parsed = JSON.parse(text);
    return (
      parsed?.message ||
      parsed?.error?.message ||
      parsed?.error?.details ||
      parsed?.error?.code ||
      parsed?.data?.message ||
      text
    );
  } catch {
    return text;
  }
}

async function postEmail(env: Env, payload: Record<string, unknown>) {
  const res = await fetch(env.ZEPTO_API_URL ?? DEFAULT_ZEPTO_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Zoho-enczapikey ${env.ZEPTO_API_KEY}`
    },
    body: JSON.stringify({
      from: {
        address: env.ZEPTO_FROM,
        name: env.ZEPTO_FROM_NAME || 'Trivia Ops'
      },
      ...payload
    })
  });
  return res;
}

export async function sendInviteEmail(env: Env, { to, inviteUrl }: InviteEmail) {
  if (!env.ZEPTO_API_KEY || !env.ZEPTO_FROM) {
    logWarn(env, 'zepto_missing_config', { hasKey: Boolean(env.ZEPTO_API_KEY), hasFrom: Boolean(env.ZEPTO_FROM) });
    return { ok: false, error: 'ZeptoMail is not configured.' };
  }

  const primaryPayload = buildPayload(to, inviteUrl, true);
  const fallbackPayload = buildPayload(to, inviteUrl, false);

  try {
    const primaryRes = await postEmail(env, primaryPayload);
    if (primaryRes.ok) return { ok: true };

    const primaryText = await primaryRes.text();
    const primaryMessage = extractErrorMessage(primaryText, primaryRes.statusText || 'Failed to send invite.');
    logWarn(env, 'zepto_send_failed_primary', {
      status: primaryRes.status,
      body: primaryText.slice(0, 200)
    });

    if (primaryRes.status >= 500) {
      const fallbackRes = await postEmail(env, fallbackPayload);
      if (fallbackRes.ok) return { ok: true };

      const fallbackText = await fallbackRes.text();
      const fallbackMessage = extractErrorMessage(fallbackText, fallbackRes.statusText || 'Failed to send invite.');
      logWarn(env, 'zepto_send_failed_fallback', {
        status: fallbackRes.status,
        body: fallbackText.slice(0, 200)
      });
      return {
        ok: false,
        error: `ZeptoMail primary ${primaryRes.status}: ${primaryMessage} | fallback ${fallbackRes.status}: ${fallbackMessage}`
      };
    }

    return { ok: false, error: `ZeptoMail ${primaryRes.status}: ${primaryMessage}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown network error';
    logWarn(env, 'zepto_send_exception', { message });
    return { ok: false, error: `ZeptoMail request failed: ${message}` };
  }
}
