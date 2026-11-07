import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  use: {
    baseURL: 'http://localhost:5199',
    viewport: { width: 1400, height: 850 },
    trace: 'off',
    launchOptions: {
      // Software WebGL so the 3D view renders in headless CI.
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
      executablePath: process.env.PW_CHROMIUM_PATH || undefined,
    },
  },
  webServer: { command: 'npx vite --port 5199 --strictPort', port: 5199, reuseExistingServer: true },
});
