import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  use: {
    baseURL: 'http://localhost:5199',
    viewport: { width: 1400, height: 850 },
    trace: 'off',
    // the existing specs drive the Workshop (milestone 37: a new browser starts in Quick build); Quick build specs clear this
    storageState: { cookies: [], origins: ['http://localhost:5199', 'http://127.0.0.1:8787', 'http://localhost:8787'].map((origin) => ({ origin, localStorage: [{ name: 'cutforge.viewPrefs', value: JSON.stringify({ mode: 'workshop' }) }] })) },
    launchOptions: {
      // Software WebGL so the 3D view renders in headless CI.
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
      executablePath: process.env.PW_CHROMIUM_PATH || undefined,
    },
  },
  webServer: [
    { command: 'npx vite --port 5199 --strictPort', port: 5199, reuseExistingServer: true },
    {
      // the real Worker (workerd) with local D1 and R2, fresh state for each run
      command:
        'rm -rf .wrangler/e2e && npx wrangler d1 migrations apply cutforge --local --persist-to .wrangler/e2e && npx wrangler dev --port 8787 --ip 127.0.0.1 --persist-to .wrangler/e2e --var TEACHER_KEY:e2e-teacher-key --var SESSION_SECRET:e2e-session-secret',
      url: 'http://127.0.0.1:8787/api/teacher/classes', // 401 = up
      reuseExistingServer: false,
      timeout: 120_000,
      ignoreHTTPSErrors: true,
    },
  ],
});
