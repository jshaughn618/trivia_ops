import type { Env } from './types';
import { queryFirst } from './db';

const CODE_LENGTH = 4;
const CODE_CHARS = '0123456789';
const TEAM_CODE_LENGTH = 4;
const TEAM_CODE_CHARS = '0123456789';

export async function generateEventCode(env: Env): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = randomCode();
    const existing = await queryFirst<{ id: string }>(env, 'SELECT id FROM events WHERE public_code = ?', [code]);
    if (!existing) return code;
  }
  throw new Error('Unable to generate unique event code');
}

export async function generateTeamCode(env: Env, eventId: string): Promise<string> {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    const code = randomTeamCode();
    const existing = await queryFirst<{ id: string }>(
      env,
      'SELECT id FROM teams WHERE event_id = ? AND team_code = ? AND COALESCE(deleted, 0) = 0',
      [eventId, code]
    );
    if (!existing) return code;
  }
  throw new Error('Unable to generate unique team code');
}

function randomCode() {
  let result = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    const idx = Math.floor(Math.random() * CODE_CHARS.length);
    result += CODE_CHARS[idx];
  }
  return result;
}

function randomTeamCode() {
  let result = '';
  for (let i = 0; i < TEAM_CODE_LENGTH; i += 1) {
    const idx = Math.floor(Math.random() * TEAM_CODE_CHARS.length);
    result += TEAM_CODE_CHARS[idx];
  }
  return result;
}

export function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

export function normalizeTeamCode(code: string) {
  return code.replace(/\D/g, '').trim();
}
