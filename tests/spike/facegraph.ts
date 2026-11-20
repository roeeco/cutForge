// Milestone 119 (R0) spike: a face graph from hand-written polygons or from a
// kernel mesh — flat faces with outlines (and holes) in their own frames, and
// the edges they share with their dihedral angles. Kept as the reference for
// R3 (src/model/polyhedron.ts), which writes it in the engine's own types.
type V3 = [number, number, number];
type P2 = { x: number; y: number };

export type SFace = { key: string; o: V3; u: V3; v: V3; n: V3; outer: P2[]; holes: P2[][]; area: number };
export type SEdge = { key: string; a: string; b: string; p: V3; q: V3; len: number; dihedral: number };
export type SGraph = { faces: SFace[]; edges: SEdge[] };

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => mul(a, 1 / (Math.hypot(...a) || 1));
const area2 = (r: P2[]) => r.reduce((s, p, i) => s + p.x * r[(i + 1) % r.length].y - r[(i + 1) % r.length].x * p.y, 0) / 2;

/** A face's frame from its first boundary edge and its outward normal; its rings in (u, v). */
function frameOf(n: V3, ring3: V3[]): { o: V3; u: V3; v: V3 } {
  const o = ring3[0];
  let u = norm(sub(ring3[1], ring3[0]));
  u = norm(sub(u, mul(n, dot(u, n))));
  return { o, u, v: cross(n, u) };
}
const to2 = (f: { o: V3; u: V3; v: V3 }, p: V3): P2 => ({ x: dot(sub(p, f.o), f.u), y: dot(sub(p, f.o), f.v) });

/** Edges between faces from their rings' vertex ids (each directed edge i→j of one face meets j→i of another). */
function pairEdges(faces: SFace[], rings: { face: number; ids: number[] }[], V: V3[]): SEdge[] {
  const dir = new Map<string, number>();
  for (const r of rings) for (let k = 0; k < r.ids.length; k++) dir.set(`${r.ids[k]},${r.ids[(k + 1) % r.ids.length]}`, r.face);
  const out: SEdge[] = [];
  const seen = new Set<string>();
  const centre = faces.map((f) => add(f.o, add(mul(f.u, f.outer.reduce((s, p) => s + p.x, 0) / f.outer.length), mul(f.v, f.outer.reduce((s, p) => s + p.y, 0) / f.outer.length))));
  for (const [k, fa] of dir) {
    const [i, j] = k.split(',').map(Number);
    const fb = dir.get(`${j},${i}`);
    if (fb === undefined || fa === fb) continue;
    const id = `${Math.min(i, j)}-${Math.max(i, j)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const A = faces[fa], B = faces[fb];
    const p = V[i], q = V[j];
    const mid = mul(add(p, q), 0.5);
    const between = Math.acos(Math.max(-1, Math.min(1, dot(A.n, B.n)))) * (180 / Math.PI);
    const convex = dot(A.n, sub(centre[fb], mid)) < 1e-9;
    out.push({ key: `${A.key}|${B.key}#${id}`, a: A.key, b: B.key, p, q, len: Math.hypot(...sub(q, p)), dihedral: convex ? 180 - between : 180 + between });
  }
  return out;
}

/** From vertices and polygon faces (counter-clockwise seen from outside, no holes). */
export function fromPolygons(V: V3[], F: number[][], name = 'f'): SGraph {
  const faces: SFace[] = F.map((ids, k) => {
    const r = ids.map((i) => V[i]);
    let n: V3 = [0, 0, 0];
    for (let i = 0; i < r.length; i++) n = add(n, cross(r[i], r[(i + 1) % r.length]));
    n = norm(n);
    const fr = frameOf(n, r);
    const outer = r.map((p) => to2(fr, p));
    return { key: `${name}${k}`, ...fr, n, outer, holes: [], area: area2(outer) };
  });
  return { faces, edges: pairEdges(faces, F.map((ids, face) => ({ face, ids })), V) };
}

/**
 * From a triangle mesh (shared vertices): adjacent triangles in one plane are
 * one face; each face's boundary is walked into rings, the counter-clockwise
 * one its outline and the others its holes.
 */
export function fromTriangles(V: V3[], T: [number, number, number][], name = 'k'): SGraph {
  const nT = T.map((t) => norm(cross(sub(V[t[1]], V[t[0]]), sub(V[t[2]], V[t[0]]))));
  const dT = T.map((t, i) => dot(nT[i], V[t[0]]));
  // union adjacent coplanar triangles
  const parent = T.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const byEdge = new Map<string, number>();
  T.forEach((t, i) => t.forEach((a, k) => byEdge.set(`${a},${t[(k + 1) % 3]}`, i)));
  T.forEach((t, i) =>
    t.forEach((a, k) => {
      const j = byEdge.get(`${t[(k + 1) % 3]},${a}`);
      // one plane within float noise (the kernel's facets of a revolution are planar, but not to 1e-9)
      if (j !== undefined && dot(nT[i], nT[j]) > 1 - 1e-6 && Math.abs(dT[i] - dT[j]) < 1e-4) parent[find(i)] = find(j);
    }),
  );
  const groups = new Map<number, number[]>();
  T.forEach((_, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), i]));
  const faces: SFace[] = [];
  const rings: { face: number; ids: number[] }[] = [];
  for (const tris of groups.values()) {
    // boundary: directed edges with no reverse inside the group
    const inG = new Set<string>();
    for (const i of tris) T[i].forEach((a, k) => inG.add(`${a},${T[i][(k + 1) % 3]}`));
    const next = new Map<number, number>();
    for (const e of inG) {
      const [a, b] = e.split(',').map(Number);
      if (!inG.has(`${b},${a}`)) next.set(a, b);
    }
    const loops: number[][] = [];
    const used = new Set<number>();
    for (const s of next.keys()) {
      if (used.has(s)) continue;
      const loop: number[] = [];
      let c = s;
      while (!used.has(c) && next.has(c)) {
        used.add(c);
        loop.push(c);
        c = next.get(c)!;
      }
      if (loop.length >= 3) loops.push(loop);
    }
    const n = nT[tris[0]];
    const fr = frameOf(n, loops[0].map((i) => V[i]));
    const two = loops.map((l) => l.map((i) => to2(fr, V[i])));
    const outerK = two.reduce((best, r, k) => (Math.abs(area2(r)) > Math.abs(area2(two[best])) ? k : best), 0);
    const face = faces.length;
    faces.push({ key: `${name}${face}`, ...fr, n, outer: two[outerK], holes: two.filter((_, k) => k !== outerK), area: area2(two[outerK]) + two.filter((_, k) => k !== outerK).reduce((s, r) => s + area2(r), 0) });
    loops.forEach((ids) => rings.push({ face, ids }));
  }
  return { faces, edges: pairEdges(faces, rings, V) };
}

// ---------------------------------------------------------------------------
// The hand-written fixtures (sizes in mm)

const ring = (n: number, r: number, z: number, rot = 0): V3[] => Array.from({ length: n }, (_, i) => [r * Math.cos(rot + (2 * Math.PI * i) / n), r * Math.sin(rot + (2 * Math.PI * i) / n), z]);

export function prism(n: number, r: number, h: number): SGraph {
  const V = [...ring(n, r, 0), ...ring(n, r, h)];
  const F = [Array.from({ length: n }, (_, i) => n - 1 - i), Array.from({ length: n }, (_, i) => n + i), ...Array.from({ length: n }, (_, i) => [i, (i + 1) % n, n + ((i + 1) % n), n + i])];
  return fromPolygons(V, F, 'prism');
}

export function cube(s: number): SGraph {
  const V: V3[] = [[0, 0, 0], [s, 0, 0], [s, s, 0], [0, s, 0], [0, 0, s], [s, 0, s], [s, s, s], [0, s, s]];
  return fromPolygons(V, [[3, 2, 1, 0], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]], 'cube');
}

export function pyramid(n: number, r: number, h: number): SGraph {
  const V = [...ring(n, r, 0, Math.PI / n), [0, 0, h] as V3];
  return fromPolygons(V, [Array.from({ length: n }, (_, i) => n - 1 - i), ...Array.from({ length: n }, (_, i) => [i, (i + 1) % n, n])], 'pyr');
}

/** A diamond: a flat table, a ring of crown faces down to the girdle, pavilion faces down to a point (17 faces for 8 sides). */
export function diamond(n: number, r: number, crown: number, pavilion: number, table = 0.55): SGraph {
  const V = [...ring(n, r * table, crown), ...ring(n, r, 0), [0, 0, -pavilion] as V3];
  const tip = 2 * n;
  return fromPolygons(V, [Array.from({ length: n }, (_, i) => i), ...Array.from({ length: n }, (_, i) => [n + i, n + ((i + 1) % n), (i + 1) % n, i]), ...Array.from({ length: n }, (_, i) => [n + ((i + 1) % n), n + i, tip])], 'gem');
}

/** An L-shaped prism: one inside corner (270°). */
export function lPrism(): SGraph {
  const P: [number, number][] = [[0, 0], [80, 0], [80, 30], [30, 30], [30, 70], [0, 70]];
  const n = P.length, h = 50;
  const V: V3[] = [...P.map(([x, y]) => [x, y, 0] as V3), ...P.map(([x, y]) => [x, y, h] as V3)];
  return fromPolygons(V, [Array.from({ length: n }, (_, i) => n - 1 - i), Array.from({ length: n }, (_, i) => n + i), ...Array.from({ length: n }, (_, i) => [i, (i + 1) % n, n + ((i + 1) % n), n + i])], 'L');
}

/** A house: a box with a roof, its gable ends one face each (box and roof merged where they are in one plane). */
export function house(): SGraph {
  const W = 80, D = 60, H = 50, R = 30;
  const V: V3[] = [[0, 0, 0], [W, 0, 0], [W, D, 0], [0, D, 0], [0, 0, H], [W, 0, H], [W, D, H], [0, D, H], [0, D / 2, H + R], [W, D / 2, H + R]];
  return fromPolygons(V, [[3, 2, 1, 0], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 9, 5], [3, 0, 4, 8, 7], [4, 5, 9, 8], [6, 7, 8, 9]], 'house');
}
