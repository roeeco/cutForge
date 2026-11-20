// Hand-written solids for the engine's shape tests (milestones 122–127): vertices and
// faces counter-clockwise seen from outside, as `polyhedron` takes them.
import { polyhedron, type FaceIn, type Polyhedron } from '../src/model/polyhedron';
import type { Design, MaterialProfile, V3 } from '../src/model/types';
import { createDesign, solve } from '../src/model/ops';
import { MATERIALS } from '../src/model/materials';
import { addSeamNet } from '../src/model/seamNet';

const ring = (n: number, r: number, z: number, rot = 0): V3[] => Array.from({ length: n }, (_, i) => [r * Math.cos(rot + (2 * Math.PI * i) / n), z, -r * Math.sin(rot + (2 * Math.PI * i) / n)]);
const faces = (name: string, F: number[][], roles?: string[]): FaceIn[] => F.map((r, k) => ({ key: `${name}:${roles?.[k] ?? `f${k}`}`, rings: [r], src: [{ shapeId: name, role: roles?.[k] ?? `f${k}` }] }));

/** An axis-aligned box w × h × d (x, up, z) standing on the floor at the origin's corner. */
export function boxSolid(w: number, h: number, dd: number, name = 'box'): Polyhedron {
  // y is up; z towards the viewer
  const V: V3[] = [[0, 0, 0], [w, 0, 0], [w, 0, dd], [0, 0, dd], [0, h, 0], [w, h, 0], [w, h, dd], [0, h, dd]];
  return polyhedron(V, faces(name, [[0, 1, 2, 3], [4, 7, 6, 5], [3, 2, 6, 7], [1, 0, 4, 5], [2, 1, 5, 6], [0, 3, 7, 4]], ['bottom', 'top', '+z', '-z', '+x', '-x']));
}

/** An n-sided prism (radius r to its corners, height h). */
export function prismSolid(n: number, r: number, h: number, name = 'prism'): Polyhedron {
  const V = [...ring(n, r, 0), ...ring(n, r, h)];
  const F = [Array.from({ length: n }, (_, i) => n - 1 - i), Array.from({ length: n }, (_, i) => n + i), ...Array.from({ length: n }, (_, i) => [i, (i + 1) % n, n + ((i + 1) % n), n + i])];
  return polyhedron(V, faces(name, F, ['bottom', 'top', ...Array.from({ length: n }, (_, i) => `side${i}`)]));
}

/** An n-sided pyramid (base radius r, height h). */
export function pyramidSolid(n: number, r: number, h: number, name = 'pyr'): Polyhedron {
  const V = [...ring(n, r, 0, Math.PI / n), [0, h, 0] as V3];
  return polyhedron(V, faces(name, [Array.from({ length: n }, (_, i) => n - 1 - i), ...Array.from({ length: n }, (_, i) => [i, (i + 1) % n, n])], ['bottom', ...Array.from({ length: n }, (_, i) => `side${i}`)]));
}

/** A diamond: a table, crown faces down to the girdle, pavilion faces to a point (2n + 1 faces). */
export function diamondSolid(n: number, r: number, crown: number, pavilion: number, table = 0.55, name = 'gem'): Polyhedron {
  const V = [...ring(n, r * table, pavilion + crown), ...ring(n, r, pavilion), [0, 0, 0] as V3];
  const tip = 2 * n;
  return polyhedron(V, faces(name, [Array.from({ length: n }, (_, i) => i), ...Array.from({ length: n }, (_, i) => [n + i, n + ((i + 1) % n), (i + 1) % n, i]), ...Array.from({ length: n }, (_, i) => [n + ((i + 1) % n), n + i, tip])], ['top', ...Array.from({ length: n }, (_, i) => `crown${i}`), ...Array.from({ length: n }, (_, i) => `pav${i}`)]));
}

/** An L-shaped prism: one inside corner (270°). */
export function lSolid(name = 'L'): Polyhedron {
  const P: [number, number][] = [[0, 0], [80, 0], [80, 30], [30, 30], [30, 70], [0, 70]];
  const n = P.length, h = 50;
  const V: V3[] = [...P.map(([x, y]) => [x, 0, -y] as V3), ...P.map(([x, y]) => [x, h, -y] as V3)];
  return polyhedron(V, faces(name, [Array.from({ length: n }, (_, i) => n - 1 - i), Array.from({ length: n }, (_, i) => n + i), ...Array.from({ length: n }, (_, i) => [i, (i + 1) % n, n + ((i + 1) % n), n + i])], ['bottom', 'top', ...Array.from({ length: n }, (_, i) => `side${i}`)]));
}

/** A house: a box with a roof; its gable ends are one face each. */
export function houseSolid(name = 'house', H = 50, R = 30): Polyhedron {
  const W = 80, D = 60;
  // no roof: a box with the same wall keys and a flat top
  if (R <= 0) {
    const V: V3[] = [[0, 0, 0], [W, 0, 0], [W, 0, D], [0, 0, D], [0, H, 0], [W, H, 0], [W, H, D], [0, H, D]];
    return polyhedron(V, faces(name, [[0, 1, 2, 3], [1, 0, 4, 5], [3, 2, 6, 7], [2, 1, 5, 6], [0, 3, 7, 4], [4, 7, 6, 5]], ['bottom', '-z', '+z', '+x', '-x', 'top']));
  }
  const V: V3[] = [[0, 0, 0], [W, 0, 0], [W, 0, D], [0, 0, D], [0, H, 0], [W, H, 0], [W, H, D], [0, H, D], [0, H + R, D / 2], [W, H + R, D / 2]];
  return polyhedron(V, faces(name, [[0, 1, 2, 3], [1, 0, 4, 5], [3, 2, 6, 7], [2, 1, 5, 9, 6], [0, 3, 7, 8, 4], [5, 4, 8, 9], [7, 6, 9, 8]], ['bottom', '-z', '+z', '+x', '-x', 'roofBack', 'roofFront']));
}

/** A spanning tree of the faces by breadth from the first, longest edges first: a simple net (no overlap test). */
export function bfsFolds(P: Polyhedron): Set<string> {
  const keys = Object.keys(P.faces);
  const seen = new Set([keys[0]]);
  const out = new Set<string>();
  const queue = [keys[0]];
  const edges = Object.values(P.edges).sort((a, b) => b.len - a.len || (a.key < b.key ? -1 : 1));
  while (queue.length) {
    const f = queue.shift()!;
    for (const e of edges) {
      if (e.a !== f && e.b !== f) continue;
      const o = e.a === f ? e.b : e.a;
      if (seen.has(o)) continue;
      seen.add(o);
      out.add(e.key);
      queue.push(o);
    }
  }
  return out;
}

/** A solid as free boards, kept folded along `bfsFolds` and glued on the other edges (milestone 123's goldens). */
export function foldedSolid(P: Polyhedron, m: MaterialProfile = MATERIALS[0]): Design {
  const d = createDesign(m);
  addSeamNet(d, P, { folds: bfsFolds(P) });
  solve(d);
  return d;
}
