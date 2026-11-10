// Open bug repros and fuzzers (BUGFIX_PLAN.md). Kept out of `npm test` until each bug is fixed.
//   npm run test:bugs                         every repro (they fail until fixed)
//   npx vitest run -c vitest.bugs.config.ts tests/bugs-model/repro-cut-covers-panel.test.ts
// The fuzzers (fuzz.test.ts, pipeline.test.ts, quick.test.ts, ...) take FUZZ_N / FUZZ_SEED etc.; see BUGFIX_PLAN.md.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/bugs-model/**/*.test.ts', 'tests/bugs-output/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
  },
});
