// Fuzz: Guided's Build (milestone 107): random things in random boards, then random Build actions as the
// interface makes them (the guard after each, a size that leaves the sheet stepped back, a change that would
// bring a new blocking problem refused as guidedApply refuses it). Nothing may throw, the rule must hold
// after every step, and most actions must be kept.
import { beforeAll, describe, expect, it } from 'vitest';
import { loadFonts, rng, seedMath } from './gen';
import '../../src/templates/registry';
import type { Design } from '../../src/model/types';
import { MATERIALS } from '../../src/model/materials';
import { solve } from '../../src/model/ops';
import { quickGuard } from '../../src/easy/guard';
import { validate } from '../../src/model/validate';
import { blocking } from '../../src/easy/fix';
import { OBJECTS, bestCell, objectById } from '../../src/easy/objects';
import { GUIDED_MISSIONS, PLAIN } from '../../src/guided/things';
import { boxTrayOf, canSplit, insideSize, kindOf, moveDivider, removeDivider, setInsideSize, setLid, spaces, splitSpace } from '../../src/guided/box';
import { fitInPlace, fitContent } from '../../src/guided/fit';
import { newProblems } from '../../src/guided/apply';
import { dividerRow, dividersOn } from '../../src/model/dividers';

const N = Number(process.env.FUZZ_N ?? 8);
const SEED0 = Number(process.env.FUZZ_SEED ?? 1);
const STEPS = Number(process.env.FUZZ_STEPS ?? 10);
const clone = (d: Design): Design => JSON.parse(JSON.stringify(d));
const tooBig = (d: Design) => validate(d).some((i) => i.key === 'val.tooBig' || i.key === 'val.tooBigGrain');

beforeAll(loadFonts);

const stats = { kept: 0, refused: 0 };
function session(seed: number): string[] {
  const r = rng(seed);
  seedMath(seed);
  const fails: string[] = [];
  const mat = r.pick(MATERIALS.slice(0, 4));
  const things = [...GUIDED_MISSIONS, ...PLAIN].filter((t) => t.can(mat));
  const th = r.pick(things);
  let d = th.start(mat);
  if (kindOf(d) !== 'box') return fails;
  const start = validate(d).filter(blocking).map((i) => i.key);
  for (let s = 0; s < STEPS; s++) {
    const before = clone(d);
    const act = r.pick(['size', 'split', 'move', 'remove', 'lid', 'object', 'fit']);
    let label = act;
    try {
      if (act === 'size') {
        const k = r.pick(['w', 'd', 'h'] as const);
        const now = insideSize(d)![k];
        const v = Math.max(10, Math.round(now * r.num(0.5, 1.8)));
        label = `size ${k} ${now}→${v}`;
        setInsideSize(d, { [k]: v });
        solve(d);
        if (tooBig(d)) d = before; // the arrow steps back to what fits
      } else if (act === 'split') {
        const ks = spaces(d);
        if (!ks.length) continue;
        const k = r.pick(ks);
        const dir = r.pick(['sideToSide', 'frontToBack'] as const);
        if (!canSplit(d, k, dir)) continue;
        splitSpace(d, k, dir);
      } else if (act === 'move') {
        const ids = dividersOn(d, d.trays[boxTrayOf(d)!].baseId);
        if (!ids.length) continue;
        const id = r.pick(ids);
        const row = dividerRow(d, id)!;
        moveDivider(d, id, row.pos + r.num(-15, 15));
      } else if (act === 'remove') {
        const ids = dividersOn(d, d.trays[boxTrayOf(d)!].baseId);
        if (!ids.length) continue;
        removeDivider(d, r.pick(ids));
      } else if (act === 'lid') {
        setLid(d, r.pick(['none', 'liftoff', 'hinged'] as const));
      } else if (act === 'object') {
        const o = r.pick(OBJECTS.filter((x) => x.id !== 'custom'));
        const base = d.trays[boxTrayOf(d)!].baseId;
        const k = bestCell(d, base, objectById(o.id), 1);
        if (!k) continue;
        d.contents = [...(d.contents ?? []), { id: `o${s}`, object: o.id, baseId: base, x: (k.x0 + k.x1) / 2, y: (k.y0 + k.y1) / 2, count: r.int(1, 6) }];
      } else if (act === 'fit') {
        const c = d.contents?.length ? r.pick(d.contents) : null;
        if (!c || !fitContent(d, c.id)) continue;
        fitInPlace(d, c.id);
      }
      solve(d);
      quickGuard(before, d);
      // guidedApply's rule: a new blocking problem and the action is not made
      if (newProblems(before, d).length) {
        stats.refused++;
        d = before;
      } else stats.kept++;
      const now = validate(d).filter(blocking).map((i) => i.key).filter((k) => !start.includes(k));
      if (now.length) fails.push(`seed ${seed} ${th.id} ${mat.id} step ${s} ${label}: ${now.join(',')}`);
    } catch (e) {
      fails.push(`seed ${seed} ${th.id} ${mat.id} step ${s} ${label}: threw ${String((e as Error).message)}`);
      d = before;
    }
  }
  return fails;
}

describe('fuzz: Guided Build', () => {
  it(`sessions hold no blocking issue (${N} sessions × ${STEPS} steps)`, { timeout: 600_000 }, () => {
    const fails: string[] = [];
    for (let i = 0; i < N; i++) fails.push(...session(SEED0 + i));
    expect(fails).toEqual([]);
    // the rule refuses the odd action, not most of them
    expect(stats.refused).toBeLessThan(Math.max(3, stats.kept / 4));
  });
});
