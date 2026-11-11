import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5199, proxy: { '/api': 'http://localhost:8787' } },
  test: {
    include: ['tests/**/*.test.ts', 'worker/**/*.test.ts'],
    // tests/fuzz: fuzzers with small default counts; FUZZ_N (and friends, see each file) run them longer
    environment: 'node',
  },
} as any);
