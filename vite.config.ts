import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5199, proxy: { '/api': 'http://localhost:8787' } },
  test: {
    include: ['tests/**/*.test.ts', 'worker/**/*.test.ts'],
    // open bug repros and fuzzers (BUGFIX_PLAN.md): run with `npm run test:bugs`; a fixed bug's repro moves into tests/
    exclude: [...configDefaults.exclude, 'tests/bugs-model/**', 'tests/bugs-output/**'],
    environment: 'node',
  },
} as any);
