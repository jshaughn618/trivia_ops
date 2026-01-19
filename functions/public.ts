import type { Env } from './types';
import { queryFirst } from './db';

const CODE_LENGTH = 4;
const CODE_CHARS = '0123456789';

export async function generateEventCode(env: Env): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = randomCode();
    const existing = await queryFirst<{ id: string }>(env, 'SELECT id FROM events WHERE public_code = ?', [code]);
    if (!existing) return code;
  }
  throw new Error('Unable to generate unique event code');
}

function randomCode() {
  let result = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    const idx = Math.floor(Math.random() * CODE_CHARS.length);
    result += CODE_CHARS[idx];
  }
  return result;
}

export function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}
