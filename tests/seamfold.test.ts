// Milestone 123 (Shapes R4): free boards and seam folds at any angle. Solids made of
// free boards, kept folded along a spanning tree and glued on the other edges: one
// piece each, no overlap when flat, closed again in the fold view, and every flap
// drawn in 3D.
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MATERIALS } from '../src/model/materials';
import { buildPieces, netOverlaps } from '../src/model/pieces';
import { foldDisplay } from '../src/views/foldView';
import { validate } from '../src/model/validate';
import { frameNormal, toWorld } from '../src/model/frame';
import { boxSolid, foldedSolid, lSolid, prismSolid, pyramidSolid } from './solids';
import type { Polyhedron } from '../src/model/polyhedron';
import type { P2 } from '../src/model/types';

const CARD = MATERIALS[0];
const area = (pts: P2[]) => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p.x * q.y - q.x * p.y; }, 0)) / 2;

const folded = (P: Polyhedron, m = CARD) => foldedSolid(P, m);

const SOLIDS: [string, () => Polyhedron, number[]][] = [
  ['cube 60', () => boxSolid(60, 60, 60), [90]],
  ['hexagonal prism', () => prismSolid(6, 40, 60), [90, 120]],
  ['square pyramid (about 55°)', () => pyramidSolid(4, 40 * Math.SQRT2, 60), [56.3, 107.9]],
  ['12-sided tube', () => prismSolid(12, 40, 60), [90, 150]],
];

describe('the face graph of the fixtures', () => {
  it.each(SOLIDS)('%s: closed, with the expected angles', (_n, make, angles) => {
    const P = make();
    expect(P.issues).toEqual([]);
    const ds = [...new Set(Object.values(P.edges).map((e) => Math.round(e.dihedral * 10) / 10))].sort((a, b) => a - b);
    for (const a of angles) expect(ds.some((x) => Math.abs(x - a) < 0.2)).toBe(true);
  });
  it('an L-prism has one inside corner at 270°', () => {
    const P = lSolid();
    expect(Object.values(P.edges).filter((e) => Math.abs(e.dihedral - 270) < 1e-6).length).toBe(1);
  });
});

describe('seam folds', () => {
  it.each(SOLIDS)('%s: one piece, flat with no overlap, every seam laid out', (_n, make) => {
    const P = make();
    const d = folded(P);
    const nF = Object.keys(P.faces).length;
    expect(Object.values(d.connections).filter((c) => c.kind === 'fold').length).toBe(nF - 1);
    expect(Object.values(d.connections).every((c) => !c.broken)).toBe(true);
    const pieces = buildPieces(d);
    expect(pieces.length).toBe(1);
    expect(pieces[0].panels.length).toBe(nF);
    // neighbours at a shared corner overlap by under a square millimetre (the crease's strip meets at the corner): cut as one outline
    expect(netOverlaps(d, 1, undefined, true)).toEqual([]);
    // nothing in the export check says a joint failed
    expect(validate(d).filter((i) => /joint|broken|seam/i.test(i.key))).toEqual([]);
  });

  it.each(SOLIDS)('%s: the fold view closes at 1 and lies flat in one plane at 0', (_n, make) => {
    const d = folded(make());
    const shut = foldDisplay(d, 1).xf;
    for (const m of shut.values()) expect(m.equals(new THREE.Matrix4()) || m.toArray().every((v, i) => Math.abs(v - new THREE.Matrix4().toArray()[i]) < 1e-9)).toBe(true);
    const flat = foldDisplay(d, 0).xf;
    const root = d.order[0];
    const n0 = new THREE.Vector3(...frameNormal(d.panels[root].frame)).transformDirection(flat.get(root)!);
    const o0 = new THREE.Vector3(...d.panels[root].frame.o).applyMatrix4(flat.get(root)!);
    for (const id of d.order) {
      const p = d.panels[id];
      for (const q of [[0, 0], [p.w, 0], [0, p.h]] as const) {
        const w = new THREE.Vector3(...toWorld(p.frame, q[0], q[1])).applyMatrix4(flat.get(id)!);
        expect(Math.abs(w.sub(o0).dot(n0))).toBeLessThan(0.75);
      }
    }
  });

  it.each(SOLIDS)('%s: every glue flap in the net is drawn folded in 3D', (_n, make) => {
    const d = folded(make());
    for (const c of Object.values(d.connections)) {
      if (c.kind !== 'glue') continue;
      expect(c.geom!.adds.length).toBe(1);
      expect(c.geom!.flaps3d.length).toBe(1);
      expect(Math.abs(area(c.geom!.flaps3d[0].poly) / area(c.geom!.adds[0].poly) - 1)).toBeLessThan(0.05);
    }
  });

  it('a cube folded in the 3D preview closes with its flaps on the right faces: each flap lies on its receiver, inside', () => {
    const d = folded(boxSolid(60, 60, 60));
    const glue = Object.values(d.connections).filter((c) => c.kind === 'glue');
    expect(glue.length).toBe(12 - 5);
    for (const c of glue) {
      const f = c.geom!.flaps3d[0];
      expect(f.panelId).toBe(c.b.panelId);
      expect(f.owner).toBe(c.a.panelId);
      // on the receiver's inside face, within its outline
      expect(f.z0).toBeCloseTo(CARD.thickness, 9);
      const R = d.panels[c.b.panelId];
      for (const q of f.poly) {
        expect(q.x).toBeGreaterThan(-1e-6);
        expect(q.y).toBeGreaterThan(-1e-6);
        expect(q.x).toBeLessThan(R.w + 1e-6);
        expect(q.y).toBeLessThan(R.h + 1e-6);
      }
    }
  });

  it('seam folds at a 30° and a 150° turn and an inside corner keep their angle', () => {
    for (const [P, lo, hi] of [[pyramidSolid(4, 40 * Math.SQRT2, 60), 50, 115], [prismSolid(12, 40, 60), 89, 151], [lSolid(), 89, 271]] as const) {
      const d = folded(P);
      for (const c of Object.values(d.connections)) expect(c.angle).toBeGreaterThan(lo - 1), expect(c.angle).toBeLessThan(hi + 1);
      expect(buildPieces(d).length).toBe(1);
    }
  });

  it('slit locks on cut seams at any angle: tongues fold with their flap, slits on the other board', async () => {
    const { createDesign, solve } = await import('../src/model/ops');
    const { addSeamNet } = await import('../src/model/seamNet');
    const { bfsFolds } = await import('./solids');
    for (const P of [boxSolid(60, 60, 60), prismSolid(12, 40, 60), pyramidSolid(4, 40 * Math.SQRT2, 60)]) {
      const d = createDesign(CARD);
      addSeamNet(d, P, { folds: bfsFolds(P), seam: (e) => (e.len >= 25 ? 'lock' : 'glue') });
      solve(d);
      const locks = Object.values(d.connections).filter((c) => c.kind === 'lock');
      expect(locks.length).toBeGreaterThan(0);
      for (const c of locks) {
        expect(c.broken).toBeFalsy();
        const tongues = c.geom!.adds.filter((a) => a.poly.length === 6);
        expect(tongues.length).toBeGreaterThan(0);
        expect(c.geom!.flaps3d.filter((f) => f.poly.length === 6).length).toBe(tongues.length);
        expect((c.geom!.lines ?? []).length).toBe(tongues.length);
      }
    }
  });

  it.each(SOLIDS)('%s: an edit runs autoConnect, which adds and removes no seam', async (_n, make) => {
    const { autoConnect } = await import('../src/model/ops');
    const d = folded(make());
    const before = JSON.stringify(Object.keys(d.connections).sort());
    autoConnect(d);
    expect(JSON.stringify(Object.keys(d.connections).sort())).toBe(before);
    expect(buildPieces(d).length).toBe(buildPieces(folded(make())).length);
  });

  it('a board made from a face keeps its face key through a save and load', async () => {
    const { parseProject, serializeProject } = await import('../src/model/serialize');
    const d = folded(boxSolid(40, 40, 40));
    const back = parseProject(serializeProject(d));
    for (const id of d.order) expect(back.panels[id].src).toEqual(d.panels[id].src);
    for (const c of Object.values(d.connections)) {
      expect(back.connections[c.id].seam).toBe(true);
      expect(back.connections[c.id].kind).toBe(c.kind);
      expect(back.connections[c.id].hingeOf).toBe(c.hingeOf);
    }
  });
});
