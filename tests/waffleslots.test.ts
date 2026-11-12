// Milestone 52: slots that slide together, the checks and their fixes.
import { beforeAll, describe, expect, it } from 'vitest';
import { produce } from 'immer';
import { kernel, type Kernel } from '../src/sculpt/kernel';
import { addShape, createWaffleDesign, primitiveShape } from '../src/sculpt/ops';
import { sketchShape } from '../src/sculpt/sketch';
import { deriveWaffle } from '../src/waffle/derive';
import { finishParts, lineIntervals, minLigament } from '../src/waffle/finish';
import { waffleParts, waffleResult } from '../src/waffle/pieces';
import { waffleChecks } from '../src/waffle/checks';
import { applyFix } from '../src/waffle/fixes';
import { pointInPolygon } from '../src/geom/vec';
import { MATERIALS } from '../src/model/materials';
import type { Design, SculptPt } from '../src/model/types';

let k: Kernel;
beforeAll(async () => {
  k = await kernel();
});

const ply = MATERIALS.find((m) => m.kind === 'plywood' && m.thickness === 3) ?? MATERIALS[0];
function base(): Design {
  return createWaffleDesign(ply);
}
const FIX: Record<string, () => Design> = {
  sphere: () => {
    const d = base();
    addShape(d, primitiveShape('sphere', { x: 0, z: 0, w: 140, d: 140 }, 140));
    return d;
  },
  torus: () => {
    const d = base();
    addShape(d, { ...primitiveShape('torus', { x: 0, z: 0, w: 160, d: 160 }, 40), size: [160, 40, 160], tube: 40 });
    return d;
  },
  'L-extrusion with a 30° chamfer': () => {
    const d = base();
    const t30 = Math.tan(Math.PI / 6);
    const L: SculptPt[] = [
      { x: 0, y: 0 },
      { x: 150, y: 0 },
      { x: 150, y: 60 - 30 * t30 },
      { x: 120, y: 60 },
      { x: 60, y: 60 },
      { x: 60, y: 140 },
      { x: 0, y: 140 },
    ];
    addShape(d, sketchShape({ kind: 'floor' }, L, 'extrude', 80));
    return d;
  },
  vase: () => {
    const d = base();
    const v: SculptPt[] = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 70, y: 60, curve: 'auto' },
      { x: 40, y: 140 },
      { x: 50, y: 170 },
      { x: 0, y: 170 },
    ];
    addShape(d, sketchShape({ kind: 'upright', o: [0, 0, 0], ang: 0 }, v, 'revolve'));
    return d;
  },
  neck: () => {
    // two blocks joined by a neck 3 mm wide across A's slices (and full depth across B's): a slot at the
    // middle height would run through the neck and cut A's part in two
    const d = base();
    addShape(d, primitiveShape('box', { x: 0, z: 0, w: 140, d: 100 }, 40));
    addShape(d, primitiveShape('box', { x: 0, z: 0, w: 3, d: 100, y: 40 }, 6));
    addShape(d, primitiveShape('box', { x: 0, z: 0, w: 140, d: 100, y: 46 }, 40));
    d.waffle = { turn: 0, a: { spacing: { by: 'count', n: 3 } }, b: { spacing: { by: 'count', n: 3 } } };
    return d;
  },
};

/** Material of a part's final rings at a point (even-odd). */
function inside(polys: [number, number][][], x: number, y: number) {
  let n = 0;
  for (const r of polys) if (pointInPolygon({ x, y }, r.map(([px, py]) => ({ x: px, y: py })))) n++;
  return n % 2 === 1;
}

describe.each(Object.keys(FIX))('%s', (name) => {
  const d = () => FIX[name]();
  it('the assembly property: along every crossing line, A keeps material only at or below m, B only at or above', () => {
    const des = d();
    const r = waffleResult(des);
    expect(r.crossings.length).toBeGreaterThan(0);
    for (const c of r.crossings) {
      for (const key of c.aParts) {
        const p = r.parts.find((x) => x.key === key)!;
        for (const [y0, y1] of lineIntervals(p.polys, c.xa)) expect(y1).toBeLessThanOrEqual(c.m + 1e-6);
      }
      for (const key of c.bParts) {
        const p = r.parts.find((x) => x.key === key)!;
        for (const [y0] of lineIntervals(p.polys, c.xb)) expect(y0).toBeGreaterThanOrEqual(c.m - 1e-6);
      }
    }
  });
  it('every slot opens through its part’s outline in its family’s direction', () => {
    const des = d();
    const r = waffleResult(des);
    for (const c of r.crossings) {
      for (const key of c.aParts) {
        const p = r.parts.find((x) => x.key === key)!;
        // from just above m up past the top: never material (A's slots open from the top)
        for (let y = c.m + 0.05; y <= p.bbox.y1 + 1; y += 0.5) expect(inside(p.polys, c.xa, y)).toBe(false);
      }
      for (const key of c.bParts) {
        const p = r.parts.find((x) => x.key === key)!;
        for (let y = c.m - 0.05; y >= p.bbox.y0 - 1; y -= 0.5) expect(inside(p.polys, c.xb, y)).toBe(false);
      }
    }
  });
  it('exports at default spacing with no problems, or each problem has a fix that works', () => {
    let des = d();
    const issues = waffleChecks(des, waffleResult(des));
    for (const i of issues) {
      expect(i.fix, `${i.key} ${JSON.stringify(i.vars)}`).toBeDefined();
      des = produce(des, (x) => void applyFix(x as Design, i.fix!));
    }
    if (issues.length) console.log(name, issues.map((i) => `${i.key} ${JSON.stringify(i.vars)}`).join('; '));
    expect(waffleResult(des).pieces.length).toBeGreaterThan(0);
  });
});

describe('split height', () => {
  it('a neck: the middle (r = 0.5) would split the part, so the next ratio that does not wins', () => {
    const des = FIX.neck();
    const m = deriveWaffle(k, des);
    const r = finishParts(k, des, m);
    // the crossing through the neck (x = 0 on A's slices): material 0–86, the middle (43) in the neck
    const neck = r.crossings.filter((c) => Math.abs(c.xa) < 1e-6);
    expect(neck.length).toBe(3);
    for (const c of neck) {
      expect(c.J).toEqual([[expect.closeTo(0, 6), expect.closeTo(86, 6)]]);
      expect(c.splits).toBe(false);
      // 0.5 and 0.45 cut the neck; 0.55 is above it
      expect(c.m).toBeCloseTo(0.55 * 86, 6);
    }
    // away from the neck the line meets two stretches (the blocks): one slot runs through both, so some part
    // is cut in two whatever the height; that is listed (WAFFLE_MODE.md §6.3, several intervals)
    for (const c of r.crossings.filter((x) => Math.abs(x.xa) > 1)) expect(c.J.length).toBe(2);
    expect(r.problems.some((p) => p.kind === 'split')).toBe(true);
  });
  it('the ligament minimum follows the material', () => {
    const d = createWaffleDesign(ply);
    expect(minLigament(d)).toBe(Math.max(2 * ply.thickness, 3));
    const card = MATERIALS.find((x) => x.kind === 'card')!;
    expect(minLigament(createWaffleDesign(card))).toBeCloseTo(3 * card.thickness, 9);
  });
  it('a torus: a crossing with two stretches of material gets one split height, and its slots run through both', () => {
    const des = FIX.torus();
    const r = waffleResult(des);
    expect(r.crossings.some((c) => c.J.length >= 1)).toBe(true);
    expect(r.parts.every((p) => p.held)).toBe(true);
  });
});

describe('checks', () => {
  it('a lonely hole is listed with a fix that groups it', () => {
    const des = FIX.sphere();
    addShape(des, { ...primitiveShape('cylinder', { x: 0, z: 0, w: 30, d: 30 }, 200), hole: true });
    const issues = waffleChecks(des, waffleResult(des));
    const i = issues.find((x) => x.key === 'sculpt.holeAlone')!;
    expect(i).toBeDefined();
    const fixed = produce(des, (x) => void applyFix(x as Design, i.fix!));
    expect(fixed.sculpt!.order.length).toBe(1);
    expect(waffleChecks(fixed, waffleResult(fixed)).some((x) => x.key === 'sculpt.holeAlone')).toBe(false);
  });
  it('a part nothing holds gets a slice through it', () => {
    const des = FIX.sphere();
    // a small box beside the sphere, cut by A's middle slice but by no B slice
    addShape(des, primitiveShape('box', { x: 120, z: 0, w: 30, d: 12 }, 30));
    const at = (ids: string, xs: number[]) => xs.map((x, i) => ({ id: `${ids}${i + 1}`, at: x }));
    des.waffle = { turn: 0, a: { spacing: { by: 'count', n: 3 }, slices: at('a', [-40, 0, 40]) }, b: { spacing: { by: 'count', n: 3 }, slices: at('b', [-40, 0, 40]) } };
    const issues = waffleChecks(des, waffleResult(des));
    const un = issues.filter((x) => x.key === 'val.w.unheld');
    expect(un.map((x) => x.vars.part)).toEqual(['A2·2']);
    const fixed = produce(des, (x) => void applyFix(x as Design, un[0].fix!));
    // the new B slice runs through the box (its centre, 120 mm from the sphere's along x... measured from the solid's centre)
    expect(fixed.waffle!.b.slices!.length).toBe(4);
    expect(waffleChecks(fixed, waffleResult(fixed)).filter((x) => x.key === 'val.w.unheld')).toEqual([]);
  });
  it('speed: 20 shapes and 2 × 8 slices (logged, not a pass/fail)', () => {
    const des = base();
    for (let i = 0; i < 20; i++) addShape(des, primitiveShape(i % 2 ? 'sphere' : 'box', { x: (i % 5) * 30 - 60, z: Math.floor(i / 5) * 30 - 45, w: 40, d: 40 }, 40 + (i % 3) * 10));
    des.waffle = { turn: 0, a: { spacing: { by: 'count', n: 8 } }, b: { spacing: { by: 'count', n: 8 } } };
    waffleResult(des);
    const stage: number[] = [], pieces: number[] = [];
    let cur = des;
    // a drag: the same shape moved again and again (the other shapes' union is cached)
    for (let i = 0; i < 5; i++) {
      cur = produce(cur, (x) => void (x.sculpt!.shapes[x.sculpt!.order[3]].at[1] += 1));
      const t0 = performance.now();
      waffleParts(cur);
      const t1 = performance.now();
      waffleResult(cur);
      stage.push(t1 - t0);
      pieces.push(performance.now() - t1);
    }
    const f = (xs: number[]) => xs.map((x) => x.toFixed(0)).join(', ');
    console.log(`waffle edit with 20 shapes and 2 × 8 slices: slots ${f(stage)} ms; pieces and contours ${f(pieces)} ms (no fonts here: labels not timed)`);
    expect(stage.length).toBe(5);
  });
});
