// The face graph (milestone 122, SHAPES_TO_DIELINES_PLAN.md §4.2): a solid as named
// flat faces, each an outline (and holes) in its own plane frame, and the edges two
// faces share, with the angle between them inside the solid. Pure: it takes points,
// never the kernel, so the engine's tests run on hand-written solids and an imported
// mesh can come in the same way later.
import type { P2, V3 } from './types';
import { v3add, v3cross, v3dot, v3len, v3mul, v3norm, v3sub } from '../geom/v3';

/** Stable: `${shapeId}:${role}`; faces merged across shapes join their keys with '+'. */
export type FaceKey = string;
/** `${faceKeyA}|${faceKeyB}` (sorted), plus `#n` when two faces share more than one edge. */
export type EdgeKey = string;
/** A ring of a face: 0 its outline, k its hole k − 1; `i` the edge from point i to i + 1. */
export type RingRef = { ring: number; i: number };

export type PFace = {
  key: FaceKey;
  /** The face's plane: o on it, u and v in it; n = u × v points out of the solid. */
  frame: { o: V3; u: V3; v: V3 };
  n: V3;
  /** Counter-clockwise in (u, v). */
  outer: P2[];
  /** Clockwise in (u, v). */
  holes: P2[][];
  /** Where it came from: one or more (shape, role) pairs. */
  src: { shapeId: string; role: string }[];
  /** A facet of a ruled or curved face (a cylinder's side, a sphere). */
  facetOf?: 'ruled' | 'curved';
  area: number;
};

export type PEdge = {
  key: EdgeKey;
  a: FaceKey;
  b: FaceKey;
  /** The edge in each face's rings (a's runs p → q, b's q → p). */
  ea: RingRef;
  eb: RingRef;
  p: V3;
  q: V3;
  len: number;
  /** The angle inside the solid between the faces, 0–360° (90 for a box, 270 for an inside corner). */
  dihedral: number;
};

export type PolyIssue = { kind: 'open' | 'sliver' | 'tiny' | 'tooMany' | 'nonManifold'; face?: FaceKey; edge?: EdgeKey; n?: number };
export type Polyhedron = { faces: Record<FaceKey, PFace>; edges: Record<EdgeKey, PEdge>; issues: PolyIssue[] };

/** A face's input: its rings as vertex indices (the first the outline, counter-clockwise from outside), its key and source. */
export type FaceIn = { key: FaceKey; rings: number[][]; src?: PFace['src']; facetOf?: PFace['facetOf'] };

const area2 = (r: P2[]) => r.reduce((s, p, i) => s + p.x * r[(i + 1) % r.length].y - r[(i + 1) % r.length].x * p.y, 0) / 2;

/** Newell's normal of a 3D ring. */
export function ringNormal(r: V3[]): V3 {
  let n: V3 = [0, 0, 0];
  for (let i = 0; i < r.length; i++) n = v3add(n, v3cross(r[i], r[(i + 1) % r.length]));
  return v3norm(n);
}

function frameOf(n: V3, ring3: V3[]): { o: V3; u: V3; v: V3 } {
  const o = ring3[0];
  // the longest edge of the outline sets u: a frame that does not hinge on a tiny first edge
  let k = 0, best = -1;
  for (let i = 0; i < ring3.length; i++) {
    const l = v3len(v3sub(ring3[(i + 1) % ring3.length], ring3[i]));
    if (l > best + 1e-9) (best = l), (k = i);
  }
  let u = v3norm(v3sub(ring3[(k + 1) % ring3.length], ring3[k]));
  u = v3norm(v3sub(u, v3mul(n, v3dot(u, n))));
  return { o, u, v: v3cross(n, u) };
}
const to2 = (f: { o: V3; u: V3; v: V3 }, p: V3): P2 => ({ x: v3dot(v3sub(p, f.o), f.u), y: v3dot(v3sub(p, f.o), f.v) });

/** A point of a face's plane, back in 3D. */
export function faceWorld(f: Pick<PFace, 'frame'>, p: P2): V3 {
  return v3add(f.frame.o, v3add(v3mul(f.frame.u, p.x), v3mul(f.frame.v, p.y)));
}

/** Face i's ring as 2D points. */
export const ringOf = (f: PFace, ring: number): P2[] => (ring === 0 ? f.outer : f.holes[ring - 1]);

/**
 * The face graph from vertices and faces. Each directed edge i → j of one face meets
 * j → i of another. Runs of edges along one line with the same neighbour (points the
 * neighbour also has) become one edge, their middle points dropped from both faces.
 */
export function polyhedron(V: V3[], F: FaceIn[]): Polyhedron {
  const issues: PolyIssue[] = [];
  // directed edges → (face, ring, index)
  type Seg = { face: number; ring: number; i: number; a: number; b: number };
  const segs = new Map<string, Seg>();
  F.forEach((f, fi) =>
    f.rings.forEach((r, ri) =>
      r.forEach((a, i) => {
        const b = r[(i + 1) % r.length];
        const k = `${a},${b}`;
        if (segs.has(k)) issues.push({ kind: 'nonManifold', face: f.key });
        segs.set(k, { face: fi, ring: ri, i, a, b });
      }),
    ),
  );
  const nb = (a: number, b: number) => segs.get(`${b},${a}`)?.face ?? -1;
  // drop a point between two collinear edges with one neighbour face on both (and that neighbour drops it too)
  const collinear = (a: number, m: number, b: number) => {
    const u = v3sub(V[m], V[a]), w = v3sub(V[b], V[m]);
    const lu = v3len(u), lw = v3len(w);
    return lu > 1e-12 && lw > 1e-12 && v3dot(u, w) / (lu * lw) > 1 - 1e-9;
  };
  const rings: number[][][] = F.map((f) =>
    f.rings.map((r) => {
      let out = r.slice();
      for (let pass = 0; pass < r.length && out.length > 3; pass++) {
        let changed = false;
        for (let i = 0; i < out.length && out.length > 3; i++) {
          const a = out[(i - 1 + out.length) % out.length], m = out[i], b = out[(i + 1) % out.length];
          if (collinear(a, m, b) && nb(a, m) === nb(m, b)) {
            out = out.filter((_, k) => k !== i);
            changed = true;
            break;
          }
        }
        if (!changed) break;
      }
      return out;
    }),
  );
  const faces: Record<FaceKey, PFace> = {};
  const normals: V3[] = [];
  F.forEach((f, fi) => {
    const r3 = rings[fi][0].map((i) => V[i]);
    const n = ringNormal(r3);
    normals.push(n);
    const fr = frameOf(n, r3);
    const two = rings[fi].map((r) => r.map((i) => to2(fr, V[i])));
    const area = area2(two[0]) + two.slice(1).reduce((s, r) => s + area2(r), 0);
    faces[f.key] = { key: f.key, frame: fr, n, outer: two[0], holes: two.slice(1), src: f.src ?? [], ...(f.facetOf ? { facetOf: f.facetOf } : {}), area };
  });
  // the edges, from the rings that are left
  const dir = new Map<string, RingRef & { face: number }>();
  rings.forEach((rs, fi) => rs.forEach((r, ri) => r.forEach((a, i) => dir.set(`${a},${r[(i + 1) % r.length]}`, { face: fi, ring: ri, i }))));
  const edges: Record<EdgeKey, PEdge> = {};
  const seen = new Set<string>();
  const count = new Map<string, number>();
  // in a fixed order (faces, rings, points), so keys are numbered the same every time
  rings.forEach((rs, fi) =>
    rs.forEach((r, ri) =>
      r.forEach((a, i) => {
        const b = r[(i + 1) % r.length];
        const other = dir.get(`${b},${a}`);
        if (!other) return void issues.push({ kind: 'open', face: F[fi].key });
        const id = a < b ? `${a},${b}` : `${b},${a}`;
        if (seen.has(id) || other.face === fi) return;
        seen.add(id);
        const A = faces[F[fi].key], B = faces[F[other.face].key];
        const p = V[a], q = V[b];
        const d = v3norm(v3sub(q, p));
        const inA = v3cross(normals[fi], d), inB = v3cross(normals[other.face], v3mul(d, -1));
        let ang = (Math.acos(Math.max(-1, Math.min(1, v3dot(inA, inB)))) * 180) / Math.PI;
        if (v3dot(inB, normals[fi]) > 1e-9) ang = 360 - ang;
        const base = A.key < B.key ? `${A.key}|${B.key}` : `${B.key}|${A.key}`;
        const n = count.get(base) ?? 0;
        count.set(base, n + 1);
        const key = n ? `${base}#${n}` : base;
        edges[key] = { key, a: A.key, b: B.key, ea: { ring: ri, i }, eb: { ring: other.ring, i: other.i }, p, q, len: v3len(v3sub(q, p)), dihedral: ang };
      }),
    ),
  );
  // a pair of faces sharing several edges: every one of them gets its number (the first one too)
  for (const [base, n] of count)
    if (n > 1 && edges[base]) {
      edges[`${base}#0`] = { ...edges[base], key: `${base}#0` };
      delete edges[base];
    }
  return { faces, edges, issues };
}

/**
 * The face graph from a triangle mesh with shared vertices: adjacent triangles in one
 * plane (within 1e-6 on the normal and 1e-4 mm on the plane, milestone 119) that `group`
 * puts together are one face; its boundary is walked into rings (the largest its outline).
 * `group(t)` names triangle t's face (its key) and source.
 */
export function polyFromTriangles(V: V3[], T: [number, number, number][], group: (t: number) => { key: string; src: PFace['src']; facetOf?: PFace['facetOf'] }): Polyhedron {
  const nT = T.map((t) => v3norm(v3cross(v3sub(V[t[1]], V[t[0]]), v3sub(V[t[2]], V[t[0]]))));
  const dT = T.map((t, i) => v3dot(nT[i], V[t[0]]));
  const parent = T.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const byEdge = new Map<string, number>();
  T.forEach((t, i) => t.forEach((a, k) => byEdge.set(`${a},${t[(k + 1) % 3]}`, i)));
  const g = T.map((_, i) => group(i));
  T.forEach((t, i) =>
    t.forEach((a, k) => {
      const j = byEdge.get(`${t[(k + 1) % 3]},${a}`);
      if (j !== undefined && v3dot(nT[i], nT[j]) > 1 - 1e-6 && Math.abs(dT[i] - dT[j]) < 1e-4) parent[find(i)] = find(j);
    }),
  );
  const groups = new Map<number, number[]>();
  T.forEach((_, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), i]));
  const F: FaceIn[] = [];
  const used = new Map<string, number>();
  for (const tris of groups.values()) {
    const inG = new Set<string>();
    for (const i of tris) T[i].forEach((a, k) => inG.add(`${a},${T[i][(k + 1) % 3]}`));
    const next = new Map<number, number>();
    for (const e of inG) {
      const [a, b] = e.split(',').map(Number);
      if (!inG.has(`${b},${a}`)) next.set(a, b);
    }
    const loops: number[][] = [];
    const seen = new Set<number>();
    for (const s of next.keys()) {
      if (seen.has(s)) continue;
      const loop: number[] = [];
      let c = s;
      while (!seen.has(c) && next.has(c)) {
        seen.add(c);
        loop.push(c);
        c = next.get(c)!;
      }
      if (loop.length >= 3) loops.push(loop);
    }
    if (!loops.length) continue;
    const n = nT[tris[0]];
    const fr = frameOf(n, loops[0].map((i) => V[i]));
    const areas = loops.map((l) => area2(l.map((i) => to2(fr, V[i]))));
    const outerK = areas.reduce((best, a, k) => (a > areas[best] ? k : best), 0);
    // the face's name: the sources of its triangles (merged across shapes when they differ)
    const srcs = new Map<string, { key: string; src: PFace['src']; facetOf?: PFace['facetOf'] }>();
    for (const i of tris) srcs.set(g[i].key, g[i]);
    const parts = [...srcs.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
    let key = parts.map((p) => p.key).join('+');
    // two separate faces with one name (a shape cut in two by a hole): numbered
    const k = used.get(key) ?? 0;
    used.set(key, k + 1);
    if (k) key = `${key}*${k}`;
    F.push({ key, rings: [loops[outerK], ...loops.filter((_, j) => j !== outerK)], src: parts.flatMap((p) => p.src), ...(parts[0].facetOf ? { facetOf: parts[0].facetOf } : {}) });
  }
  return polyhedron(V, F);
}

/** Faces that touch edge-to-edge, as a list of neighbours per face. */
export function adjacency(P: Polyhedron): Map<FaceKey, { edge: EdgeKey; other: FaceKey }[]> {
  const m = new Map<FaceKey, { edge: EdgeKey; other: FaceKey }[]>();
  for (const f of Object.keys(P.faces)) m.set(f, []);
  for (const e of Object.values(P.edges)) {
    m.get(e.a)!.push({ edge: e.key, other: e.b });
    m.get(e.b)!.push({ edge: e.key, other: e.a });
  }
  return m;
}

/** More faces than a made model takes (milestone 119's limit: the unfolder's first pass stays quick on a school machine). */
export const MAX_FACES = 200;

/**
 * What a made model cannot cut well, for thickness t: faces narrower than 3t (slivers),
 * faces under 4t² (tiny), more than `MAX_FACES` faces, and the graph's own issues.
 */
export function polyIssues(P: Polyhedron, t: number): PolyIssue[] {
  const out: PolyIssue[] = [...P.issues];
  const n = Object.keys(P.faces).length;
  if (n > MAX_FACES) out.push({ kind: 'tooMany', n });
  for (const f of Object.values(P.faces)) {
    const per = [f.outer, ...f.holes].reduce((s, r) => s + r.reduce((a, p, i) => a + Math.hypot(r[(i + 1) % r.length].x - p.x, r[(i + 1) % r.length].y - p.y), 0), 0);
    const a = Math.abs(f.area);
    if (a < 4 * t * t) out.push({ kind: 'tiny', face: f.key });
    // a face's width: twice its area over its outline's length (exact for a long strip)
    else if ((2 * a) / (per || 1) < 1.5 * t) out.push({ kind: 'sliver', face: f.key });
  }
  return out;
}

/** The face graph moved by `off` (milestone 130: a lid set down beside its box). */
export function movePoly(P: Polyhedron, off: V3): Polyhedron {
  const mv = (p: V3): V3 => [p[0] + off[0], p[1] + off[1], p[2] + off[2]];
  const faces: Record<FaceKey, PFace> = {};
  for (const [k, f] of Object.entries(P.faces)) faces[k] = { ...f, frame: { ...f.frame, o: mv(f.frame.o) } };
  const edges: Record<EdgeKey, PEdge> = {};
  for (const [k, e] of Object.entries(P.edges)) edges[k] = { ...e, p: mv(e.p), q: mv(e.q) };
  return { faces, edges, issues: P.issues };
}

/** Two face graphs as one (their keys must not clash: a lid's are prefixed). */
export function mergePoly(a: Polyhedron, b: Polyhedron): Polyhedron {
  return { faces: { ...a.faces, ...b.faces }, edges: { ...a.edges, ...b.edges }, issues: [...a.issues, ...b.issues] };
}

/** A face graph with every key prefixed (its sources keep their own). */
export function prefixPoly(P: Polyhedron, pre: string): Polyhedron {
  const faces: Record<FaceKey, PFace> = {};
  for (const [k, f] of Object.entries(P.faces)) faces[pre + k] = { ...f, key: pre + k };
  const edges: Record<EdgeKey, PEdge> = {};
  for (const [k, e] of Object.entries(P.edges)) edges[pre + k] = { ...e, key: pre + k, a: pre + e.a, b: pre + e.b };
  return { faces, edges, issues: P.issues };
}

/** The bounds of a face graph's points (x, y, z). */
export function polyBounds(P: Polyhedron): { min: V3; max: V3 } {
  const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const e of Object.values(P.edges))
    for (const p of [e.p, e.q])
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i], p[i]);
        max[i] = Math.max(max[i], p[i]);
      }
  return { min, max };
}
