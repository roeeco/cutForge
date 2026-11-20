// The net a Make reports is the net the engine lays (papercraft's lesson: one layout).
// Before, the unfolder folded seams within 5° of flat that the engine then refused to lay:
// a faceted sphere was reported as one piece and cut as hundreds of loose faces, stacked
// where they stood. Each solid here is made, then its laid net is checked against the report.
import { beforeAll, describe, expect, it } from 'vitest';
import { kernel, type Kernel } from '../src/sculpt/kernel';
import { addShape, createWaffleDesign, primitiveShape, setHole } from '../src/sculpt/ops';
import { shapePolyhedron } from '../src/sculpt/polyhedron';
import { createDesign } from '../src/model/ops';
import { MATERIALS } from '../src/model/materials';
import { reassemble } from '../src/model/reassemble';
import { buildPieces, foldBand, netGroups, netOverlaps } from '../src/model/pieces';
import { creaseDepths } from '../src/model/crease';
import { seamFit, seamGlue } from '../src/model/seamFold';
import polygonClipping from 'polygon-clipping';
import { creaseSum } from '../src/model/foldRules';
import type { Design, MaterialProfile } from '../src/model/types';
import type { Polyhedron } from '../src/model/polyhedron';
import { boxSolid, diamondSolid, houseSolid, lSolid, prismSolid, pyramidSolid } from './solids';

const [CARD, CORR16, CORR4] = MATERIALS;

/** Make it folded, and check the laid net against what Make reported. */
function check(P: Polyhedron, m: MaterialProfile) {
  const d = createDesign(m);
  const r = reassemble(d, P, { as: 'fold' });
  const made = netGroups(d).filter((g) => d.panels[g[0].panelId]?.src);
  const split = r.issues.find((i) => i.kind === 'unfold' && i.issue.kind === 'split');
  return {
    d,
    pieces: made.length,
    islands: r.unfolding!.islands.length,
    reported: split?.kind === 'unfold' && split.issue.kind === 'split' ? split.issue.n : 1,
    broken: Object.values(d.connections).filter((c) => c.broken).length,
    overlaps: netOverlaps(d).length,
  };
}

const ok = (x: ReturnType<typeof check>) => ({ pieces: x.pieces, islands: x.islands, reported: x.reported, broken: x.broken, overlaps: x.overlaps });
const fine = (x: ReturnType<typeof check>) => ({ pieces: x.pieces, islands: x.pieces, reported: x.pieces, broken: 0, overlaps: 0 });

describe('the laid net is the reported net (hand-written solids)', () => {
  const solids: [string, () => Polyhedron][] = [
    ['a flat 24-sided pyramid (folds 4.8° off flat)', () => pyramidSolid(24, 60, 20)],
    ['a flatter one (2.4° off flat)', () => pyramidSolid(24, 60, 10)],
    ['a 36-sided prism', () => prismSolid(36, 40, 150)],
    ['a 16-sided pyramid', () => pyramidSolid(16, 30, 150)],
    ['a 16-facet diamond', () => diamondSolid(16, 45, 15, 40)],
    ['a long box', () => boxSolid(300, 200, 10)],
    ['an L-prism (an inside corner)', () => lSolid()],
    ['a house', () => houseSolid()],
  ];
  for (const m of [CARD, CORR16, CORR4])
    it.each(solids)(`%s in ${m.id}`, (_n, make) => {
      const x = check(make(), m);
      expect(ok(x)).toEqual(fine(x));
    });

  it('the flat pyramid is one piece (it was 25 loose faces)', () => {
    const x = check(pyramidSolid(24, 60, 20), CARD);
    expect(x.pieces).toBeLessThanOrEqual(2);
    expect(buildPieces(x.d).length).toBe(x.pieces);
  });
});

describe('the laid net is the reported net (shapes from the kernel)', () => {
  let k: Kernel;
  beforeAll(async () => {
    k = await kernel();
  });
  const one = (kind: Parameters<typeof primitiveShape>[0], w: number, h: number) => () => {
    const d = createWaffleDesign();
    addShape(d, primitiveShape(kind, { x: 0, z: 0, w, d: w }, h));
    return d;
  };
  const cases: [string, number, () => Design][] = [
    ['a sphere', 24, one('sphere', 60, 60)],
    ['a tall sphere', 40, one('sphere', 40, 140)],
    ['a half sphere', 40, one('halfsphere', 60, 60)],
    ['a torus', 24, one('torus', 60, 60)],
    ['a shallow cone', 40, one('cone', 120, 30)],
    ['a cylinder', 40, one('cylinder', 60, 60)],
    [
      'a box with a round hole',
      24,
      () => {
        const d = createWaffleDesign();
        addShape(d, primitiveShape('box', { x: 0, z: 0, w: 80, d: 80 }, 40));
        setHole(d, [addShape(d, primitiveShape('cylinder', { x: 20, z: 20, w: 40, d: 40 }, 90))], true);
        return d;
      },
    ],
  ];
  for (const m of [CARD, CORR16])
    it.each(cases)(`%s (%i facets) in ${m.id}`, (_n, facets, make) => {
      const x = check(shapePolyhedron(k, make().sculpt!, facets), m);
      expect(ok(x)).toEqual(fine(x));
    }, 60000);
});

describe('seam folds near flat', () => {
  it('are kept, and those within 3° of flat are not scored', () => {
    // a 24-sided pyramid 10 mm high: its sides meet at about 177.6°; 20 mm high, at about 175.2°
    for (const [h, near] of [[10, true], [20, false]] as const) {
      const P = pyramidSolid(24, 60, h);
      const x = check(P, CARD);
      const sides = Object.values(x.d.connections).filter((c) => c.seam && c.kind === 'fold' && P.edges[c.src!].dihedral > 170);
      expect(sides.length).toBeGreaterThan(20);
      expect(sides.every((c) => foldBand(x.d, c)!.scores.length === (near ? 0 : 1))).toBe(true);
    }
  });
});

describe("the unfolder's crease shift is the engine's", () => {
  it.each([CARD, CORR4])('every made seam fold in an L-prism and a diamond (%s)', (m) => {
    for (const P of [lSolid(), diamondSolid(8, 45, 15, 40)]) {
      const d = createDesign(m);
      reassemble(d, P, { as: 'fold' });
      for (const c of Object.values(d.connections)) {
        if (!c.seam || c.kind !== 'fold') continue;
        const e = P.edges[c.src!];
        const A = d.panels[c.a.panelId], B = d.panels[c.b.panelId];
        const k = creaseDepths(d, A, c.a.edge, B, c.b.edge)!;
        expect(creaseSum(m.thickness, m.thickness, e.dihedral)).toBeCloseTo(k.sP + k.sC, 6);
      }
    }
  });
});

/** How far each glue flap and slit lock, folded, lies outside the board it is glued to (mm²). */
function overhangs(d: Design): number[] {
  const area = (mp: polygonClipping.MultiPolygon) =>
    mp.reduce((s, poly) => s + poly.reduce((s2, r, j) => {
      let a = 0;
      for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
      return s2 + (j ? -1 : 1) * Math.abs(a / 2);
    }, 0), 0);
  const ring = (r: { x: number; y: number }[]): [number, number][] => [...r.map((p) => [p.x, p.y] as [number, number]), [r[0].x, r[0].y]];
  const out: number[] = [];
  for (const c of Object.values(d.connections)) {
    if (!c.seam || (c.kind !== 'glue' && c.kind !== 'lock')) continue;
    const A = d.panels[c.a.panelId], B = d.panels[c.b.panelId];
    const f = seamFit(A, c.a.edge, B, c.b.edge);
    const folded = f && seamGlue(d, c, f).flaps3d[0];
    if (!folded || B.sketch.kind !== 'poly') continue;
    out.push(outside(folded.poly, B.sketch.pts));
  }
  return out;

  /** The area of `a` outside `b`: clipped exactly to a convex board, else by polygon-clipping on a snapped grid. */
  function outside(a: { x: number; y: number }[], b: { x: number; y: number }[]): number {
    const sh = (r: { x: number; y: number }[]) => r.reduce((s, p, i) => s + p.x * r[(i + 1) % r.length].y - r[(i + 1) % r.length].x * p.y, 0) / 2;
    const ccw = sh(b) >= 0 ? b : [...b].reverse();
    const cross = (p: { x: number; y: number }, q: { x: number; y: number }, t: { x: number; y: number }) => (q.x - p.x) * (t.y - p.y) - (q.y - p.y) * (t.x - p.x);
    const convex = ccw.every((p, i) => cross(p, ccw[(i + 1) % ccw.length], ccw[(i + 2) % ccw.length]) >= -1e-9);
    if (convex) {
      let poly = a;
      for (let i = 0; i < ccw.length && poly.length; i++) {
        const p = ccw[i], q = ccw[(i + 1) % ccw.length], next: { x: number; y: number }[] = [];
        for (let j = 0; j < poly.length; j++) {
          const s0 = poly[j], s1 = poly[(j + 1) % poly.length], c0 = cross(p, q, s0), c1 = cross(p, q, s1);
          if (c0 >= 0) next.push(s0);
          if ((c0 >= 0) !== (c1 >= 0)) {
            const t = c0 / (c0 - c1);
            next.push({ x: s0.x + (s1.x - s0.x) * t, y: s0.y + (s1.y - s0.y) * t });
          }
        }
        poly = next;
      }
      return Math.abs(sh(a)) - (poly.length >= 3 ? Math.abs(sh(poly)) : 0);
    }
    for (const g of [0, 1e-6, 1e-5, 1e-4]) {
      const snap = (r: { x: number; y: number }[]) => ring(r.map((p) => (g ? { x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g } : p)));
      try {
        return area(polygonClipping.difference([snap(a)], [snap(b)]));
      } catch {
        /* the next grid */
      }
    }
    throw new Error('could not measure a flap');
  }
}

describe('flaps are sized for the board they are glued to (papercraft\'s way)', () => {
  let k: Kernel;
  beforeAll(async () => {
    k = await kernel();
  });
  const shape = (kind: Parameters<typeof primitiveShape>[0], w: number, h: number, facets: number) => () => {
    const d = createWaffleDesign();
    addShape(d, primitiveShape(kind, { x: 0, z: 0, w, d: w }, h));
    return shapePolyhedron(k, d.sculpt!, facets);
  };
  // before, a flap lay up to 44 mm² past a cone's sliver of a face, 41 mm² past a tall pyramid's
  const cases: [string, () => Polyhedron][] = [
    ['a tall 8-sided pyramid', () => pyramidSolid(8, 30, 150)],
    ['an 8-facet diamond', () => diamondSolid(8, 45, 15, 40)],
    ['an L-prism', () => lSolid()],
    ['a cone (slivers of faces)', () => shape('cone', 60, 80, 24)()],
    ['a sphere', () => shape('sphere', 60, 60, 24)()],
    ['a gem', () => shape('gem', 60, 60, 12)()],
  ];
  for (const m of [CARD, CORR16])
    it.each(cases)(`%s in ${m.id}: every flap lies on its board, none dropped`, (_n, make) => {
      const d = createDesign(m);
      const r = reassemble(d, make(), { as: 'fold' });
      const o = overhangs(d);
      expect(o.length).toBeGreaterThan(0);
      expect(Math.max(...o)).toBeLessThan(0.5);
      expect(r.issues.filter((i) => i.kind === 'unfold' && i.issue.kind === 'flapDropped')).toEqual([]);
    }, 60000);

  it('an end narrows at the corner of the board it is glued to: a long wedge on a sliver, both tapers stored', () => {
    const d = createDesign(CARD);
    reassemble(d, shape('cone', 60, 80, 24)(), { as: 'fold' });
    const flaps = Object.values(d.connections).filter((c) => c.seam && (c.kind === 'glue' || c.kind === 'lock'));
    expect(flaps.every((c) => c.flapTaperB !== undefined)).toBe(true);
    // a cone's side faces meet at its tip at a few degrees: the flap's end there runs far along the seam
    expect(flaps.some((c) => Math.max(c.flapTaper!, c.flapTaperB!) > 3 * Math.min(c.flapTaper!, c.flapTaperB!))).toBe(true);
  });
});
