// Milestone 186: the shapes-to-fold engine, from testing it as a student with awkward
// booleans. Each case was wrong before: an inside corner got a second, automatic glue
// joint whose flap lay over the net; a hole's walls were never joined; a cylinder came out
// in two pieces where one fits; a rounded box's corners were cut into 16 slivers each.
import { beforeAll, describe, expect, it } from 'vitest';
import polygonClipping from 'polygon-clipping';
import { kernel, type Kernel } from '../src/sculpt/kernel';
import { addShape, createWaffleDesign, groupShapes, primitiveShape } from '../src/sculpt/ops';
import { shapePolyhedron } from '../src/sculpt/polyhedron';
import { reassemble, unfoldFlaps, unfoldSpecOf } from '../src/model/reassemble';
import { autoConnect } from '../src/model/ops';
import { netGroups, netOverlaps } from '../src/model/pieces';
import { validate } from '../src/model/validate';
import { overlapArea, unfold } from '../src/model/unfold';
import { MATERIALS } from '../src/model/materials';
import type { Design, P2, Shape3 } from '../src/model/types';

const [CARD, CORR16, CORR4] = MATERIALS;
let k: Kernel;
beforeAll(async () => {
  k = await kernel();
});

type S = Omit<Shape3, 'id' | 'name'>;
const P = (kind: Parameters<typeof primitiveShape>[0], w: number, h: number, d: number, extra: Partial<S> = {}, at: [number, number, number] = [0, 0, 0]): S => ({ ...primitiveShape(kind, { x: at[0], z: at[2], y: at[1], w, d }, h), ...extra });

/** Shapes made into a fold of `m`, then one more round of the store's own joining (as any edit after Make runs). */
function folded(shapes: S[], m = CARD, group = false): Design {
  const d = createWaffleDesign(m);
  d.id = 'engine-test';
  const ids = shapes.map((s) => addShape(d, s));
  if (group) groupShapes(d, ids);
  reassemble(d, shapePolyhedron(k, d.sculpt!, 12), { as: 'fold' });
  autoConnect(d);
  return d;
}
const problems = (d: Design) => validate(d).map((i) => i.key);

describe('folding awkward booleans (milestone 186)', () => {
  it('an inside corner keeps the joints the net chose: no second glue joint, no flap over the net', () => {
    // two boxes meeting in an L, and a box with a corner notched out by a hole
    for (const [shapes, group] of [
      [[P('box', 120, 40, 40), P('box', 40, 40, 80, {}, [-40, 0, 60])], false],
      [[P('box', 100, 60, 80), { ...P('box', 50, 30, 40, {}, [25, 30, 20]), hole: true as const }], true],
    ] as const) {
      const d = folded([...shapes], CARD, group);
      expect(Object.values(d.connections).filter((c) => !c.seam)).toEqual([]);
      expect(netOverlaps(d)).toEqual([]);
      expect(problems(d)).toEqual([]);
      expect(netGroups(d)).toHaveLength(1);
    }
  });

  for (const m of [CARD, CORR4])
    it(`a box with a round hole through it in ${m.id}: each wall of the hole is glued round its rim`, () => {
      const d = folded([P('box', 100, 60, 100), { ...P('cylinder', 40, 60, 40), hole: true }], m, true);
      const walls = d.order.filter((id) => d.panels[id].src!.face.includes('hole:'));
      expect(walls).toHaveLength(12);
      const rims = Object.values(d.connections).filter((c) => c.b.edge === 'face');
      // a flap at each end of each wall, glued under the top and the bottom
      expect(rims).toHaveLength(24);
      expect(rims.every((c) => c.kind === 'glue' && !c.broken && walls.includes(c.a.panelId) && c.why === 'joint.why.rim')).toBe(true);
      // folded square onto the board round the hole, on its inside, away from the hole
      for (const c of rims) {
        const f = c.geom!.flaps3d![0];
        expect(Math.abs(Math.abs(f.angle!) - 90)).toBeLessThan(1);
        expect(f.z0).toBeCloseTo(m.thickness, 6);
      }
      const byBoard = new Map<string, P2[][]>();
      for (const c of rims) byBoard.set(c.b.panelId, [...(byBoard.get(c.b.panelId) ?? []), c.geom!.flaps3d![0].poly]);
      for (const polys of byBoard.values()) {
        const base = polys.flatMap((q) => [q[0], q[3]]);
        const cx = base.reduce((s, q) => s + q.x, 0) / base.length, cy = base.reduce((s, q) => s + q.y, 0) / base.length;
        const r = (q: P2) => Math.hypot(q.x - cx, q.y - cy);
        expect(Math.min(...polys.flatMap((q) => [q[1], q[2]]).map(r))).toBeGreaterThan(Math.max(...base.map(r)));
      }
      expect(problems(d)).toEqual([]);
    });

  it('a 12-sided cylinder of card lies flat in one piece, whatever the seed', () => {
    for (let s = 0; s < 6; s++) {
      const d = createWaffleDesign(CARD);
      d.id = `cyl-${s}`;
      addShape(d, P('cylinder', 80, 100, 80));
      const poly = shapePolyhedron(k, d.sculpt!, 12);
      const flaps = unfoldFlaps(poly, CARD, { as: 'fold' });
      const u = unfold(poly, { ...unfoldSpecOf(d, CARD, { as: 'fold' }), flap: (e) => flaps[e.key] ?? 0 });
      expect(u.islands).toHaveLength(1);
      expect(u.restarts).toBe(0);
    }
    const d = folded([P('cylinder', 80, 100, 80)]);
    expect(netGroups(d)).toHaveLength(1);
    expect(problems(d)).toEqual([]);
  });

  it("a rounded box's corners follow Faces around a curve (12 a turn: 3 a corner), and it folds in one piece", () => {
    const d = createWaffleDesign(CARD);
    addShape(d, P('box', 100, 60, 80, { corners: [15, 15, 15, 15] }));
    expect(Object.keys(shapePolyhedron(k, d.sculpt!, 12).faces)).toHaveLength(6 + 4 * 3);
    expect(Object.keys(shapePolyhedron(k, d.sculpt!, 8).faces)).toHaveLength(6 + 4 * 2);
    const f = folded([P('box', 100, 60, 80, { corners: [15, 15, 15, 15] })]);
    expect(netGroups(f)).toHaveLength(1);
    expect(problems(f)).toEqual([]);
  });

  it('twin spheres, a sphere with a bite out of it and a chopped corner fold with nothing to fix', () => {
    const q: [number, number, number, number] = [0.3647, 0.2798, 0.1159, 0.8806];
    for (const [shapes, m] of [
      [[P('sphere', 70, 70, 70), P('sphere', 70, 70, 70, {}, [40, 0, 0])], CARD],
      [[P('sphere', 100, 100, 100), { ...P('box', 60, 60, 60, {}, [35, 50, 35]), hole: true as const }], CARD],
      [[P('box', 80, 80, 80), { ...P('box', 80, 80, 80, { q }, [40, 70, 40]), hole: true as const }], CORR16],
    ] as const) {
      const d = folded([...shapes], m, true);
      expect(netOverlaps(d)).toEqual([]);
      expect(Object.values(d.connections).filter((c) => !c.seam)).toEqual([]);
    }
  }, 30000);
});

describe('overlap areas (milestone 186: convex pairs without a sweep)', () => {
  const sweep = (a: P2[], b: P2[]) => {
    const r = (x: P2[]) => [...x.map((p) => [p.x, p.y] as [number, number]), [x[0].x, x[0].y] as [number, number]];
    return polygonClipping.intersection([r(a)], [r(b)]).reduce((s, poly) => s + poly.reduce((t, ring, i) => {
      let A = 0;
      for (let j = 0; j < ring.length - 1; j++) A += ring[j][0] * ring[j + 1][1] - ring[j + 1][0] * ring[j][1];
      return t + (i ? -1 : 1) * Math.abs(A / 2);
    }, 0), 0);
  };
  it('match polygon-clipping, a concave outline against a convex one included', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const ngon = (n: number, cx: number, cy: number, r: number): P2[] => Array.from({ length: n }, (_, i) => ({ x: cx + r * Math.cos((2 * Math.PI * i) / n), y: cy + r * Math.sin((2 * Math.PI * i) / n) }));
    const L: P2[] = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 30 }, { x: 0, y: 30 }];
    for (let i = 0; i < 200; i++) {
      const a = ngon(3 + Math.floor(rnd() * 8), rnd() * 30, rnd() * 30, 3 + rnd() * 15);
      const b = i % 2 ? ngon(4, rnd() * 30, rnd() * 30, 5 + rnd() * 10) : L;
      expect(overlapArea(a, b)).toBeCloseTo(sweep(a, b), 6);
      // clockwise works too
      expect(overlapArea(b.slice().reverse(), a)).toBeCloseTo(sweep(a, b), 6);
    }
  });
});

describe('boards that meet at a point or past a joint, in plywood (milestone 187)', () => {
  const PLY = MATERIALS[3];
  const boards = (shapes: S[], group = false) => {
    const d = createWaffleDesign(PLY);
    d.id = 'boards-test';
    const ids = shapes.map((s) => addShape(d, s));
    if (group) groupShapes(d, ids);
    const P = shapePolyhedron(k, d.sculpt!, 8);
    const r = reassemble(d, P, { as: 'boards' });
    autoConnect(d);
    return { d, P, r };
  };
  const clashes = (d: Design) => validate(d).map((i) => i.key).filter((x) => x === 'val.collide' || x.startsWith('val.notJoined') || x === 'val.broken');

  it('a pyramid, a cone, a loft, an obelisk, a diamond, a wedge and a sphere: no board runs into another, none lost', () => {
    for (const [shapes, group] of [
      [[P('pyramid', 80, 80, 80)], false],
      [[P('cone', 80, 100, 80)], false],
      [[P('loft', 80, 80, 80)], false],
      [[P('box', 50, 120, 50), P('pyramid', 50, 30, 50, {}, [0, 120, 0])], true],
      [[P('gem', 80, 60, 80)], false],
      [[P('wedge', 80, 50, 100)], false],
      [[P('sphere', 100, 100, 100)], false],
    ] as const) {
      const { d, P: poly, r } = boards([...shapes], group);
      expect(d.order).toHaveLength(Object.keys(poly.faces).length);
      expect(clashes(d)).toEqual([]);
      expect(r.issues.filter((i) => i.kind === 'corner')).toEqual([]);
    }
  });

  it("a trimmed board stays inside its face and keeps its face's edge names", () => {
    const { d, P: poly } = boards([P('cone', 80, 100, 80)]);
    const trimmed = d.order.map((id) => d.panels[id]).filter((p) => p.sketch.kind === 'poly' && p.sketch.edgeIds.some((x) => x.startsWith('r')));
    expect(trimmed.length).toBeGreaterThan(0);
    for (const p of trimmed) {
      const f = poly.faces[p.src!.face];
      if (p.sketch.kind !== 'poly') continue;
      // each face edge that is left keeps its name; the trim's own edges are r0, r1…
      expect(p.sketch.edgeIds.filter((x) => x.startsWith('e')).every((x) => Number(x.slice(1)) < f.outer.length)).toBe(true);
      expect(new Set(p.sketch.edgeIds).size).toBe(p.sketch.edgeIds.length);
    }
  });

  it('a wedge in plywood: its sharp edge is glued, the smaller board standing on the slope', () => {
    const { d, P: poly } = boards([P('wedge', 80, 50, 100)]);
    const butt = Object.values(d.connections).find((c) => c.kind === 'butt' && c.b.edge === 'face');
    expect(butt).toBeTruthy();
    expect(poly.edges[butt!.src!].dihedral).toBeLessThan(30);
    expect(d.panels[butt!.b.panelId].src!.face).toMatch(/slope$/);
  });
});

describe('faces around a curve from its size and the material (milestone 188)', () => {
  const fold = (t: number) => ({ thickness: t });
  it('keeps the old counts where they suit, and moves only where faces were too wide or too narrow', async () => {
    const { autoFacets } = await import('../src/sculpt/polyhedron');
    const s = (kind: Parameters<typeof primitiveShape>[0], w: number, h = 100) => primitiveShape(kind, { x: 0, z: 0, w, d: w }, h) as Shape3;
    // a cylinder of card: 12 as before; a wide one more, so no face is over 25 mm; a thin one fewer
    expect(autoFacets(s('cylinder', 80), 'fold', fold(0.5))).toBe(12);
    expect(autoFacets(s('cylinder', 250), 'fold', fold(0.5))).toBe(24);
    expect(autoFacets(s('cylinder', 20), 'fold', fold(0.5))).toBe(12);
    // 4 mm corrugated: no face narrower than 24 mm where the size allows
    expect(autoFacets(s('cylinder', 80), 'fold', fold(4))).toBe(10);
    expect(autoFacets(s('torus', 120, 20), 'fold', fold(4))).toBe(6);
    // a sphere: a multiple of 4 (the kernel cuts it so), at most 16 folded
    expect(autoFacets(s('sphere', 100, 100), 'fold', fold(0.5))).toBe(12);
    expect(autoFacets(s('sphere', 250, 250), 'fold', fold(0.5))).toBe(16);
    // boards: at most 12 (neighbours at 150° or less still take a joint)
    expect(autoFacets(s('cylinder', 80), 'boards', fold(3))).toBe(8);
    expect(autoFacets(s('cylinder', 250), 'boards', fold(3))).toBe(12);
    // a rounded box: by its corners' radius; no curve, none
    expect(autoFacets({ ...s('box', 100), corners: [15, 15, 15, 15] }, 'fold', fold(4))).toBe(4);
    expect(autoFacets(s('box', 100), 'fold', fold(0.5))).toBeUndefined();
  });

  it('a ring of 4 mm corrugated folds with no slivers and nothing to fix (it was 144 faces of 5 mm)', async () => {
    const { facetsFor } = await import('../src/make/run');
    const d = createWaffleDesign(CORR4);
    d.id = 'ring';
    addShape(d, P('torus', 120, 20, 120));
    const f = facetsFor({ as: 'fold' }, CORR4);
    const poly = shapePolyhedron(k, d.sculpt!, f.n, f.byShape);
    expect(Object.keys(poly.faces).length).toBeLessThan(50);
    reassemble(d, poly, { as: 'fold' });
    expect(validate(d).map((i) => i.key).filter((x) => x === 'val.collide' || x === 'val.sliver')).toEqual([]);
    // a number set on the Make card wins
    expect(facetsFor({ as: 'fold', facets: { card: 8 } }, CORR4).n).toBe(8);
  });
});

describe('joints onto a face past a corner joint (milestone 189)', () => {
  it('twin spheres and a spherical dent in plywood: no broken joint (an edge on a face is glued, never a plain butt)', () => {
    for (const [shapes] of [
      [[P('sphere', 70, 70, 70), P('sphere', 70, 70, 70, {}, [40, 0, 0])]],
      [[P('box', 100, 50, 100), { ...P('sphere', 60, 60, 60, {}, [0, 25, 0]), hole: true as const }]],
    ] as const) {
      const d = createWaffleDesign(MATERIALS[3]);
      const ids = [...shapes].map((s) => addShape(d, s));
      groupShapes(d, ids);
      reassemble(d, shapePolyhedron(k, d.sculpt!, 8), { as: 'boards' });
      autoConnect(d);
      expect(Object.values(d.connections).filter((c) => c.broken)).toEqual([]);
      expect(Object.values(d.connections).filter((c) => c.kind === 'butt' && (c.a.edge === 'face' || c.b.edge === 'face')).every((c) => c.seam && c.b.edge === 'face')).toBe(true);
    }
  }, 60000);
});
