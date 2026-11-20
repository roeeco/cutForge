// The fuzzer's promise checks (milestone 134, QA_FIX_PLAN.md O1) as a gate: random op sequences, and after every
// joint change the joints asked for are the joints made, and each joint list shows what its joints are.
// Fails today (REPORT.md §10); milestone 135 (Q1) flips it to `it`.
import { expect, it } from 'vitest';
import { genOp, mulberry32, runSeq } from '../fuzz/fuzz';

/** The fuzz driver's sequence for a seed (tests/fuzz/fuzz.test.ts, `seqFor`; not imported, which would run its test here too). */
function seqFor(seed: number, steps: number) {
  const r = mulberry32(seed * 7919 + 13);
  const mat = Math.floor(r() * 4);
  return { seq: Array.from({ length: steps }, () => genOp(r)), mat };
}

it.fails('joint promises hold over seeded op sequences', () => {
  const broken: string[] = [];
  for (let seed = 1; seed <= 8; seed++) {
    const { seq, mat } = seqFor(seed, 20);
    const r = runSeq(seq, mat, { promises: true, only: (c) => c.startsWith('promise:') });
    for (const f of r.failures) broken.push(`seed ${seed} step ${f.step}: ${f.cls}: ${f.msg}`);
  }
  expect(broken).toEqual([]);
});
