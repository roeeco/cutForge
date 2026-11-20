// Milestones 126–127 (Shapes R7, R8): reassembly on hand-written solids (the engine's part).
import { describe, expect, it } from 'vitest';
import { createDesign } from '../src/model/ops';
import { MATERIALS } from '../src/model/materials';
import { reassemble } from '../src/model/reassemble';
import { buildPieces, netOverlaps } from '../src/model/pieces';
import { validate } from '../src/model/validate';
import { parseProject, serializeProject } from '../src/model/serialize';
import { boxSolid, diamondSolid, houseSolid, lSolid, prismSolid, pyramidSolid } from './solids';
import type { Polyhedron } from '../src/model/polyhedron';

const [CARD, CORR16, CORR4, PLY] = MATERIALS;
const SOLIDS: [string, () => Polyhedron][] = [
  ['cube', () => boxSolid(70, 70, 70)],
  ['hexagonal prism', () => prismSolid(6, 40, 70)],
  ['pyramid', () => pyramidSolid(4, 60, 70)],
  ['diamond', () => diamondSolid(8, 45, 15, 40)],
  ['L-prism', () => lSolid()],
  ['house', () => houseSolid()],
];

describe('Fold it (engine)', () => {
  it.each(SOLIDS)('%s in card: pieces as the unfolder made them, no overlap, nothing broken, ids from keys', (_n, make) => {
    const P = make();
    const d = createDesign(CARD);
    const r = reassemble(d, P, { as: 'fold' });
    expect(d.outcome).toBe('fold');
    expect(Object.values(d.connections).every((c) => !c.broken)).toBe(true);
    expect(buildPieces(d).length).toBe(r.unfolding!.islands.length);
    expect(netOverlaps(d, 1, undefined, true)).toEqual([]);
    expect(Object.keys(d.panels).every((id) => id.startsWith('f:'))).toBe(true);
    expect(Object.values(d.connections).every((c) => c.why && c.src)).toBe(true);
    // the export check finds nothing broken
    expect(validate(d).filter((i) => /broken|thin|overlap/i.test(i.key))).toEqual([]);
  });

  it('the same shapes and spec give the same design twice (ids, joints, net)', () => {
    const a = createDesign(CARD), b = createDesign(CARD);
    b.id = a.id;
    reassemble(a, houseSolid(), { as: 'fold' });
    reassemble(b, houseSolid(), { as: 'fold' });
    expect(JSON.stringify(a.connections)).toBe(JSON.stringify(b.connections));
    expect(JSON.stringify(a.panels)).toBe(JSON.stringify(b.panels));
  });

  it('Make again replaces what was made and keeps a hand-made board', async () => {
    const { addRootPanel } = await import('../src/model/ops');
    const d = createDesign(CARD);
    const mine = addRootPanel(d, 300, 0, 40, 40);
    reassemble(d, boxSolid(50, 50, 50), { as: 'fold' });
    const n = d.order.length;
    reassemble(d, boxSolid(50, 50, 50), { as: 'fold' });
    expect(d.order.length).toBe(n);
    expect(d.panels[mine]).toBeTruthy();
  });

  it('a corrugated cube folds with tabs on its long seams', () => {
    const d = createDesign(CORR16);
    reassemble(d, boxSolid(90, 90, 90), { as: 'fold' });
    const kinds = Object.values(d.connections).map((c) => c.kind);
    expect(kinds.filter((k) => k === 'fold').length).toBe(5);
    expect(kinds).toContain('tabslot');
    expect(Object.values(d.connections).every((c) => !c.broken)).toBe(true);
  });

  it('the spec and the choices survive a save and load', () => {
    const d = createDesign(CARD);
    reassemble(d, pyramidSolid(4, 60, 70), { as: 'fold', prefer: 'cuts' });
    const back = parseProject(serializeProject(d));
    expect(back.make).toEqual(d.make);
  });
});

describe('Build from boards (engine)', () => {
  it('a plywood box: six boards, twelve corners, fingers and the lid on tabs', () => {
    const d = createDesign(PLY);
    const r = reassemble(d, boxSolid(100, 80, 90), { as: 'boards' });
    expect(d.order).toHaveLength(6);
    const cs = Object.values(d.connections);
    expect(cs).toHaveLength(12);
    expect(cs.every((c) => !c.broken)).toBe(true);
    expect(cs.filter((c) => c.kind === 'finger').length).toBe(8);
    // the top closes last: its four corners are tabs it carries
    const top = d.order.find((id) => id.endsWith(':top'))!;
    const tabs = cs.filter((c) => c.kind === 'tabslot');
    expect(tabs).toHaveLength(4);
    expect(tabs.every((c) => c.a.panelId === top)).toBe(true);
    expect(r.issues.filter((i) => i.kind === 'corner')).toEqual([]);
    // six pieces, the outside sizes the shape's
    expect(buildPieces(d)).toHaveLength(6);
  });

  it('corners outside 30–150° are listed (a diamond in plywood)', () => {
    const d = createDesign(PLY);
    const r = reassemble(d, diamondSolid(8, 45, 15, 40), { as: 'boards' });
    expect(r.issues.some((i) => i.kind === 'corner' && (i.dihedral < 30 || i.dihedral > 150))).toBe(true);
  });

  it('a corrugated 4 mm house: tabs where the corners allow, glue past 150°', () => {
    const d = createDesign(CORR4);
    reassemble(d, houseSolid(), { as: 'boards' });
    const cs = Object.values(d.connections);
    expect(cs.length).toBeGreaterThan(0);
    expect(cs.every((c) => !c.broken)).toBe(true);
    expect(cs.some((c) => c.kind === 'tabslot')).toBe(true);
  });

  it("a plywood box keeps the shape's outside sizes: its boards' outer faces span it", async () => {
    const { toWorld } = await import('../src/model/frame');
    const d = createDesign(PLY);
    reassemble(d, boxSolid(100, 80, 90), { as: 'boards' });
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const id of d.order) {
      const p = d.panels[id];
      for (const [u, v] of [[0, 0], [p.w, 0], [p.w, p.h], [0, p.h]]) {
        const w = toWorld(p.frame, u, v);
        (x0 = Math.min(x0, w[0])), (x1 = Math.max(x1, w[0])), (y0 = Math.min(y0, w[1])), (y1 = Math.max(y1, w[1])), (z0 = Math.min(z0, w[2])), (z1 = Math.max(z1, w[2]));
      }
    }
    expect(x1 - x0).toBeCloseTo(100, 6);
    expect(y1 - y0).toBeCloseTo(80, 6);
    expect(z1 - z0).toBeCloseTo(90, 6);
  });

  it.each([['an L-shelf', lSolid], ['a hexagonal planter', () => prismSolid(6, 60, 80)]] as const)('%s in plywood: every corner joined, nothing listed', (_n, make) => {
    const d = createDesign(PLY);
    const r = reassemble(d, make(), { as: 'boards' });
    expect(r.issues).toEqual([]);
    expect(Object.values(d.connections).every((c) => !c.broken && c.why)).toBe(true);
  });
});

describe('Build from boards: what it lists', () => {
  it('a form with no face up has no board to put in last', () => {
    const d = createDesign(PLY);
    // a tall spire: its base faces down and its steep sides face out, none up
    const P = pyramidSolid(4, 30, 200);
    const r = reassemble(d, P, { as: 'boards' });
    expect(r.issues).toContainEqual({ kind: 'noLast' });
  });
});

