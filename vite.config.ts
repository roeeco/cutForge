import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5199, proxy: { '/api': 'http://localhost:8787' } },
  build: {
    rollupOptions: {
      output: {
        // the libraries in files of their own (code splitting, 20 November): they change far less often than the
        // app, so a browser keeps them across releases and downloads only the app's own code again (Rolldown's groups)
        advancedChunks: {
          groups: [
            { name: 'three', test: /node_modules[\\/](three|three-stdlib)[\\/]/, priority: 40 },
            { name: 'r3f', test: /node_modules[\\/](@react-three|its-fine|suspend-react|react-use-measure)[\\/]/, priority: 30 },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler|use-sync-external-store|zustand)[\\/]/, priority: 20 },
            { name: 'opentype', test: /node_modules[\\/]opentype\.js[\\/]/, priority: 20 },
          ],
        },
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts', 'worker/**/*.test.ts'],
    // tests/fuzz: fuzzers with small default counts; FUZZ_N (and friends, see each file) run them longer
    environment: 'node',
  },
} as any);
