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
