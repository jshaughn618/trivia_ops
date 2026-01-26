import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const rootDir = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8')) as { version?: string };
const appVersion = packageJson.version ?? '0.0.0';

let appCommit = 'unknown';
try {
  appCommit = execSync('git rev-parse --short HEAD', { cwd: rootDir }).toString().trim();
} catch {
  appCommit = 'unknown';
}

const appBuildDate = new Date().toISOString();

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __APP_COMMIT__: JSON.stringify(appCommit),
    __APP_BUILD_DATE__: JSON.stringify(appBuildDate)
  }
});
