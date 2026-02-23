import type { Env } from '../types';
import { logWarn } from './log';

const DEFAULT_ZEPTO_URL = 'https://api.zeptomail.com/v1.1/email';

type InviteEmail = {
  to: string;
  inviteUrl: string;
};

type ZeptoAttempt = {
  name: 'primary' | 'fallback';
  status: number | null;
  statusText: string;
  headers: Record<string, string>;
  bodySnippet: string;
};

export type ZeptoDiagnosticResult = {
  ok: boolean;
  error?: string;
  attempts: ZeptoAttempt[];
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

function headerSubset(headers: Headers) {
  const keys = [
    'content-type',
    'x-request-id',
    'x-ratelimit-limit',
    'x-ratelimit-remaining',
    'x-ratelimit-reset',
    'retry-after',
    'cf-ray'
  ];
  const out: Record<string, string> = {};
  keys.forEach((key) => {
    const value = headers.get(key);
    if (value) out[key] = value;
  });
  return out;
}

export async function sendInviteEmailDiagnostic(env: Env, { to, inviteUrl }: InviteEmail): Promise<ZeptoDiagnosticResult> {
  if (!env.ZEPTO_API_KEY || !env.ZEPTO_FROM) {
    logWarn(env, 'zepto_missing_config', { hasKey: Boolean(env.ZEPTO_API_KEY), hasFrom: Boolean(env.ZEPTO_FROM) });
    return {
      ok: false,
      error: 'ZeptoMail is not configured.',
      attempts: []
    };
  }

  const primaryPayload = buildPayload(to, inviteUrl, true);
  const fallbackPayload = buildPayload(to, inviteUrl, false);
  const attempts: ZeptoAttempt[] = [];

  try {
    const primaryRes = await postEmail(env, primaryPayload);
    const primaryText = primaryRes.ok ? '' : await primaryRes.text();
    attempts.push({
      name: 'primary',
      status: primaryRes.status,
      statusText: primaryRes.statusText,
      headers: headerSubset(primaryRes.headers),
      bodySnippet: primaryText.slice(0, 500)
    });
    if (primaryRes.ok) return { ok: true, attempts };

    const primaryMessage = extractErrorMessage(primaryText, primaryRes.statusText || 'Failed to send invite.');
    logWarn(env, 'zepto_send_failed_primary', {
      status: primaryRes.status,
      statusText: primaryRes.statusText,
      headers: headerSubset(primaryRes.headers),
      body: primaryText.slice(0, 500)
    });

    if (primaryRes.status >= 500) {
      const fallbackRes = await postEmail(env, fallbackPayload);
      const fallbackText = fallbackRes.ok ? '' : await fallbackRes.text();
      attempts.push({
        name: 'fallback',
        status: fallbackRes.status,
        statusText: fallbackRes.statusText,
        headers: headerSubset(fallbackRes.headers),
        bodySnippet: fallbackText.slice(0, 500)
      });
      if (fallbackRes.ok) return { ok: true, attempts };

      const fallbackMessage = extractErrorMessage(fallbackText, fallbackRes.statusText || 'Failed to send invite.');
      logWarn(env, 'zepto_send_failed_fallback', {
        status: fallbackRes.status,
        statusText: fallbackRes.statusText,
        headers: headerSubset(fallbackRes.headers),
        body: fallbackText.slice(0, 500)
      });
      return {
        ok: false,
        error: `ZeptoMail primary ${primaryRes.status}: ${primaryMessage} | fallback ${fallbackRes.status}: ${fallbackMessage}`,
        attempts
      };
    }

    return { ok: false, error: `ZeptoMail ${primaryRes.status}: ${primaryMessage}`, attempts };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown network error';
    logWarn(env, 'zepto_send_exception', { message, attempts });
    return { ok: false, error: `ZeptoMail request failed: ${message}`, attempts };
  }
}

export async function sendInviteEmail(env: Env, { to, inviteUrl }: InviteEmail) {
  const diagnostic = await sendInviteEmailDiagnostic(env, { to, inviteUrl });
  if (diagnostic.ok) return { ok: true as const };
  return { ok: false as const, error: diagnostic.error ?? 'Failed to send invite.' };
}
