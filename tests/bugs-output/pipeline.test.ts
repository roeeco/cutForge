// Fuzz: random designs -> pieces -> packing -> prepared sheets -> SVG / DXF.
import { beforeAll, describe, expect, it } from 'vitest';
import { loadFonts, randomDesign, rng, seedMath } from './gen';
import { checkPipeline, type Fail } from './pipecheck';

const N = Number(process.env.FUZZ_N ?? 150);
const SEED0 = Number(process.env.FUZZ_SEED ?? 1);

beforeAll(loadFonts);

function checkDesign(seed: number, fails: Fail[], stats: Record<string, number>) {
  const r = rng(seed);
  seedMath(seed);
  const { d, log } = randomDesign(r, { allowHuge: true });
  checkPipeline(d, seed, log, fails, stats);
}

describe('fuzz: pieces -> pack -> export', () => {
  it(`holds invariants on ${N} random designs`, () => {
    const fails: Fail[] = [];
    const stats: Record<string, number> = {};
    for (let s = SEED0; s < SEED0 + N; s++) checkDesign(s, fails, stats);
    const byCls = new Map<string, Fail[]>();
    for (const f of fails) byCls.set(f.cls, [...(byCls.get(f.cls) ?? []), f]);
    const summary = [...byCls].map(([k, v]) => `${k}: ${v.length} (seeds ${[...new Set(v.map((x) => x.seed))].slice(0, 8).join(',')})\n    e.g. ${v[0].msg.slice(0, 900)}`).join('\n');
    console.log('stats', JSON.stringify(stats), '\n' + summary);
    expect(summary).toBe('');
  }, 600_000);
});
