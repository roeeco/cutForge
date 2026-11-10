// Fuzz driver. Env: FUZZ_FROM, FUZZ_N (seeds), FUZZ_STEPS (ops per design), FUZZ_OUT (json report path), FUZZ_SHRINK=1.
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { genOp, mulberry32, runSeq, shrink, type Op } from './fuzz';

const FROM = Number(process.env.FUZZ_FROM ?? 1);
const N = Number(process.env.FUZZ_N ?? 20);
const STEPS = Number(process.env.FUZZ_STEPS ?? 30);
const OUT = process.env.FUZZ_OUT;
const SHRINK = process.env.FUZZ_SHRINK === '1';
const EVERY = Number(process.env.FUZZ_EVERY ?? 1);
const SKIP = (process.env.FUZZ_SKIP ?? '').split(',').filter(Boolean);
const AUTOIDEM = process.env.FUZZ_AUTOIDEM === '1';

export function seqFor(seed: number, steps = STEPS): { seq: Op[]; mat: number } {
  const r = mulberry32(seed * 7919 + 13);
  const mat = Math.floor(r() * 4);
  return { seq: Array.from({ length: steps }, () => genOp(r, { edge: process.env.FUZZ_PLAUSIBLE !== '1' })), mat };
}

const withRandom = <T,>(seed: number, f: () => T): T => {
  const old = Math.random;
  Math.random = mulberry32(seed);
  try {
    return f();
  } finally {
    Math.random = old;
  }
};

it('fuzz', () => {
  const classes = new Map<string, { seed: number; count: number; step: number; msg: string; mat: number; seq: Op[]; shrunk?: Op[] }>();
  let iters = 0, ops = 0;
  const t0 = Date.now();
  for (let s = FROM; s < FROM + N; s++) {
    const { seq, mat } = seqFor(s);
    const skip = (cls: string) => !SKIP.some((k) => cls.startsWith(k));
    const res = withRandom(s, () => runSeq(seq, mat, { every: EVERY, only: skip, autoIdem: AUTOIDEM }));
    iters++;
    ops += seq.length;
    const seen = new Set<string>();
    for (const fl of res.failures) {
      if (seen.has(fl.cls)) continue;
      seen.add(fl.cls);
      const e = classes.get(fl.cls);
      if (e) e.count++;
      else classes.set(fl.cls, { seed: s, count: 1, step: fl.step, msg: fl.msg, mat, seq: seq.slice(0, fl.step + 1) });
    }
  }
  if (SHRINK)
    for (const [cls, e] of classes) {
      const fails = (q: Op[]) => withRandom(e.seed, () => runSeq(q, e.mat, { stopAtFirst: true, only: (c) => c === cls, autoIdem: AUTOIDEM }).failures.length > 0);
      if (fails(e.seq)) e.shrunk = shrink(e.seq, fails);
    }
  const report = [...classes.entries()].sort((a, b) => b[1].count - a[1].count).map(([cls, e]) => ({ cls, ...e, seq: SHRINK ? undefined : e.seq.length }));
  console.log(`iters=${iters} ops=${ops} time=${((Date.now() - t0) / 1000).toFixed(1)}s classes=${classes.size}`);
  for (const r of report) console.log(`${r.count}\t${r.cls}\tseed=${r.seed} step=${r.step} mat=${r.mat}${r.shrunk ? ' shrunk=' + r.shrunk.length : ''}\n\t${String(r.msg).slice(0, 300)}`);
  if (OUT) writeFileSync(OUT, JSON.stringify({ iters, ops, report }, null, 1));
}, 3_600_000);
