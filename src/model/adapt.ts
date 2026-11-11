// Adaptive grow (milestone 19): what a grown panel would meet before it is
// committed. The ghost is an ordinary panel built from the grow settings; its
// height and width snap to other panels, and its outline is trimmed to the near
// faces of the panels in its path. The trim is computed once, at commit, and
// stored as ordinary wall corners and inserts (it is not re-derived later, so
// it cannot form a cycle with the panels it was trimmed against).
import type { ConnectionKind, Design, P2, Panel, WallSketch } from './types';
import { findEdge, isCurveKey, panelEdges, segDir, segInward, segLength, sketchRing, type EdgeArg } from './edges';
import { edgeLength, frameNormal, growFrame, matDir, toLocal, toWorld, type GrowDir, type Seating } from './frame';
import { pointInPolygon } from '../geom/vec';
import { crossesItself, detailCorners, detailInstances, panelNotches, panelOutline } from './geometry';
import { cornerFit } from './seams';
import { profileOf, tOf } from './materials';
import { v3add, v3dot, v3mul, v3sub } from '../geom/v3';

export type GhostSpec = { height: number; angle: number; dir: GrowDir; kind: ConnectionKind; offset: number; seating: Seating; span?: [number, number] | null; sketch?: WallSketch | null };

/** Where a grown panel stands along its parent edge: [s0, s1] in mm from the edge's start (the whole edge when absent). */
export function spanOf(parent: Panel, edge: EdgeArg, span?: [number, number] | null): [number, number] {
  const L = edgeLength(parent, edge);
  if (!span) return [0, L];
  const s0 = Math.max(0, Math.min(L, Math.min(span[0], span[1]))), s1 = Math.max(0, Math.min(L, Math.max(span[0], span[1])));
  return s1 - s0 < 1e-6 ? [0, L] : [s0, s1];
}

/** The frame of a grown panel on part of its parent edge: the full-edge frame moved along the edge by s0. */
export function spanFrame(parent: Panel, edge: EdgeArg, angle: number, dir: GrowDir, t: number, seating: Seating, offset: number, span?: [number, number] | null, tc = t) {
  const f = growFrame(parent, edge, angle, dir, t, seating, offset, tc);
  const [s0] = spanOf(parent, edge, span);
  return s0 ? { ...f, o: v3add(f.o, v3mul(f.u, s0)) } : f;
}

/** A panel's thickness, also for a ghost (not in the design): its own material's. */
export function ghostT(d: Design, p: Panel): number {
  return d.panels[p.id] ? tOf(d, p.id) : profileOf(d, p.material).thickness;
}

/** The panel a grow would add (not part of the design). */
export function ghostPanel(d: Design, parentId: string, edge: string, g: GhostSpec): Panel | null {
  const parent = d.panels[parentId];
  if (!parent || !findEdge(parent, edge)) return null;
  const [s0, s1] = spanOf(parent, edge, g.span);
  const frame = spanFrame(parent, edge, g.angle, g.dir, tOf(d, parentId), g.seating, g.offset, g.span);
  // a grown board takes its parent's material
  return { id: 'ghost', name: '', w: s1 - s0, h: g.height, sketch: { kind: 'wall', ...(g.sketch ?? {}) }, frame, details: [], ...(parent.material ? { material: parent.material } : {}) };
}

/** Stretches [s0, s1] of a parent edge not taken by panels grown on it at the edge itself. */
export function edgeFreeSpans(d: Design, parentId: string, edge: string): [number, number][] {
  const parent = d.panels[parentId];
  if (!parent || !findEdge(parent, edge)) return [];
  const L = edgeLength(parent, edge);
  const taken: [number, number][] = [];
  for (const c of Object.values(d.connections)) {
    if (c.a.panelId === parentId && c.a.edge === edge && !(c.grown && c.offset > 0)) taken.push(c.grown && !c.trayId ? spanOf(parent, edge, c.span) : [0, L]);
    if (c.b.panelId === parentId && c.b.edge === edge) taken.push([0, L]);
  }
  taken.sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  let cur = 0;
  for (const [a, b] of taken) {
    if (a - cur > 1e-6) out.push([cur, a]);
    cur = Math.max(cur, b);
  }
  if (L - cur > 1e-6) out.push([cur, L]);
  return out;
}

/** Is there room left on an edge to grow from (a free stretch of at least `min` mm)? */
export function edgeHasRoom(d: Design, parentId: string, edge: string, min = 5): boolean {
  // a curve's flattened segments are not growable
  if (isCurveKey(edge)) return false;
  return edgeFreeSpans(d, parentId, edge).some(([a, b]) => b - a >= min - 1e-9);
}

/**
 * Snap positions for a ghost's ends along its parent edge: the edge's ends and
 * midpoint, the ends of panels already grown on it, and where other panels
 * cross or touch the edge line (their faces and corners), in mm from the start.
 */
export function spanTargets(d: Design, parentId: string, edge: string): number[] {
  const parent = d.panels[parentId];
  const e = parent && findEdge(parent, edge);
  if (!e) return [];
  const L = segLength(e);
  const out = new Set<number>([0, L, L / 2]);
  for (const [a, b] of edgeFreeSpans(d, parentId, edge)) {
    out.add(a);
    out.add(b);
  }
  const t = tOf(d, parentId);
  const a3 = toWorld(parent.frame, e.a.x, e.a.y), b3 = toWorld(parent.frame, e.b.x, e.b.y);
  const dir = v3mul(v3sub(b3, a3), 1 / L);
  const up = matDir(parent.frame);
  for (const id of d.order) {
    const p = d.panels[id];
    if (!p || id === parentId) continue;
    for (const q of panelEdges(p))
      for (const z of [0, tOf(d, id)]) {
        const w = toWorld(p.frame, q.a.x, q.a.y, z);
        const r = v3sub(w, a3);
        const s = v3dot(r, dir);
        // near the edge line (within the material's thickness above or below it)
        const off = v3sub(r, v3mul(dir, s));
        const hgt = v3dot(off, up);
        const side = Math.sqrt(Math.max(0, v3dot(off, off) - hgt * hgt));
        if (s > -1e-6 && s < L + 1e-6 && side < 2 * t + 1e-6 && Math.abs(hgt) < 4 * t + 1e-6) out.add(Math.round(s * 1e6) / 1e6);
      }
  }
  // milestone 35: the base's own shapes (corners and centres, seen across onto the edge)
  const inl = segInward(e);
  const ed = segDir(e);
  const along = (q: P2) => (q.x - e.a.x) * ed.x + (q.y - e.a.y) * ed.y;
  for (const dt of parent.details)
    for (const i of detailInstances(dt)) {
      const pts = i.rot && i.shape !== 'circle' ? detailCorners(i) : [{ x: i.cx - i.w / 2, y: i.cy - i.h / 2 }, { x: i.cx + i.w / 2, y: i.cy + i.h / 2 }];
      for (const q of [...pts, { x: i.cx, y: i.cy }]) {
        const s0 = along(q);
        if (s0 > -1e-6 && s0 < L + 1e-6) out.add(Math.round(s0 * 1e6) / 1e6);
      }
    }
  void inl;
  // equal thirds and quarters of each free stretch
  for (const [a, b] of edgeFreeSpans(d, parentId, edge)) for (const k of [1 / 3, 2 / 3, 1 / 4, 3 / 4]) out.add(Math.round((a + (b - a) * k) * 1e6) / 1e6);
  // the mirror of a span on the opposite edge (a wall grown on part of a parallel edge facing this one), so two partial walls line up
  for (const c of Object.values(d.connections)) {
    if (!c.grown || c.a.panelId !== parentId || c.a.edge === edge || !c.span || c.trayId) continue;
    const oe = findEdge(parent, c.a.edge);
    if (!oe) continue;
    const od = segDir(oe);
    if (Math.abs(od.x * ed.x + od.y * ed.y) < 0.999) continue;
    for (const sv of c.span) {
      const q = { x: oe.a.x + od.x * sv, y: oe.a.y + od.y * sv };
      const s0 = along(q);
      if (s0 > -1e-6 && s0 < L + 1e-6) out.add(Math.round(s0 * 1e6) / 1e6);
    }
  }
  return [...out].sort((x, y) => x - y);
}

/** Snap a value to the nearest target within tol, or null. */
export function snapTo(v: number, targets: number[], tol: number): number | null {
  let best: number | null = null;
  for (const x of targets) if (Math.abs(x - v) <= tol && (best === null || Math.abs(x - v) < Math.abs(best - v))) best = x;
  return best;
}

/**
 * Snap heights for a ghost: where its free (top) edge would land on another
 * panel — a corner or edge of it lying in the ghost's plane (a neighbouring
 * wall's top), or one of its faces crossing the ghost's growth direction (the
 * opposite wall's outer face for a lid).
 */
export function heightTargets(d: Design, ghost: Panel, exclude: Set<string>): number[] {
  const t = ghostT(d, ghost);
  const n = frameNormal(ghost.frame), m = matDir(ghost.frame);
  const out = new Set<number>();
  const o = ghost.frame.o;
  for (const id of d.order) {
    const p = d.panels[id];
    if (!p || exclude.has(id)) continue;
    // corners lying in the ghost's slab, within its width
    const tp = tOf(d, id);
    for (const q of panelEdges(p))
      for (const z of [0, tp]) {
        const w = toWorld(p.frame, q.a.x, q.a.y, z);
        const depth = v3dot(v3sub(w, o), m);
        if (depth < -0.05 || depth > t + 0.05) continue;
        const l = toLocal(ghost.frame, w);
        if (l.x >= -1e-6 && l.x <= ghost.w + 1e-6 && l.y > 1) out.add(Math.round(l.y * 1e6) / 1e6);
      }
    // faces crossing the growth direction: the plane at depth 0 or t of p, reached along v from the ghost's bottom edge
    const mp = matDir(p.frame);
    const k = v3dot(ghost.frame.v, mp);
    if (Math.abs(k) < 0.5 || Math.abs(v3dot(frameNormal(p.frame), n)) > 0.999) continue;
    for (const z of [0, tp]) {
      const d0 = v3dot(v3sub(o, p.frame.o), mp) - z;
      const y = -d0 / k;
      if (y <= 1) continue;
      // the landing point must be on that panel's outline
      const at = toLocal(p.frame, toWorld(ghost.frame, ghost.w / 2, y));
      if (panelEdges(p).length && pointInPolygon(at, panelEdges(p).map((e) => e.a))) out.add(Math.round(y * 1e6) / 1e6);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * The ghost's outline trimmed to the panels in its path: for each position
 * along its width, the top comes down to the nearest face of another panel it
 * would run into (between its two faces, whichever meets first), so a wall
 * under a sloped roof gets a gable and a panel grown into a neighbour stops at
 * its face. Panels it already starts inside (its parent and the walls beside
 * it) are left alone. The result is the ghost's wall sketch (top corners and
 * inserts on the top edge), or null when nothing is in the way.
 */
export function adaptiveSketch(d: Design, ghost: Panel, exclude: Set<string>): WallSketch | null {
  const t = ghostT(d, ghost);
  const w = ghost.w, h = ghost.h;
  const N = 96;
  const xs = Array.from({ length: N + 1 }, (_, i) => (w * i) / N);
  const top = xs.map(() => h);
  // which board trimmed each column
  const by: (string | null)[] = xs.map(() => null);
  const nG = frameNormal(ghost.frame);
  for (const id of d.order) {
    const p = d.panels[id];
    if (!p || exclude.has(id)) continue;
    if (Math.abs(v3dot(frameNormal(p.frame), nG)) > 0.999) continue; // parallel: no clean face to stop at
    // the ghost's top edge meets this panel at an outer corner (a lid reaching the opposite wall): the corner joint takes the overlap
    if (panelEdges(p).some((e) => cornerFit(ghost, 'e2', p, e.key))) continue;
    const mp = matDir(p.frame);
    const ring = sketchRing(p).map((e) => e.a);
    for (let i = 0; i <= N; i++) {
      for (const zg of [0, t]) {
        // depth into p along the ghost's column x: d(y) = d0 + dy·y
        const base = toWorld(ghost.frame, xs[i], 0, zg);
        const d0 = v3dot(v3sub(base, p.frame.o), mp), dy = v3dot(ghost.frame.v, mp);
        if (Math.abs(dy) < 1e-9) continue;
        const ya = (0 - d0) / dy, yb = (tOf(d, id) - d0) / dy;
        const lo = Math.min(ya, yb);
        if (lo <= 0.05 || lo >= top[i]) continue; // starts inside it (or is not reached below the current top)
        const hit = toLocal(p.frame, toWorld(ghost.frame, xs[i], lo + 1e-6, zg));
        if (!pointInPolygon(hit, ring)) continue;
        top[i] = lo;
        by[i] = id;
      }
    }
  }
  // a board that only cuts across a corner of the top (an angled far wall): stop a little clear of it, so the
  // two do not merely touch; one the whole top meets (a roof) is joined to it and keeps its line
  for (const id of new Set(by.filter((x): x is string => !!x))) {
    const cols = by.map((x, i) => (x === id ? i : -1)).filter((i) => i >= 0);
    if (cols.length < N / 2 && (cols[0] === 0 || cols[cols.length - 1] === N)) for (const i of cols) top[i] = Math.max(0.05, top[i] - 2 * gapOf(d, ghost));
  }
  // between two columns the true line may dip lower than either sample: take the lower of the neighbours (BUGFIX_PLAN B18)
  const sampled = [...top];
  // (only where the line bends: a straight stretch between samples is exact)
  for (let i = 0; i <= N; i++) {
    const a = sampled[Math.max(0, i - 1)], b = sampled[Math.min(N, i + 1)];
    if (Math.abs(a - 2 * sampled[i] + b) > 1e-3) top[i] = Math.min(sampled[i], a, b);
  }
  const sides = sideTrims(d, ghost, t);
  if (top.every((y) => Math.abs(y - h) < 1e-6) && !sides.e1.length && !sides.e3.length) return null;
  // the end columns stand in the panels beside the ghost (left out above): carry the trimmed line on through them
  const inner = xs.map((x) => x > t + 1e-6 && x < w - t - 1e-6);
  const firstIn = inner.indexOf(true), lastIn = inner.lastIndexOf(true);
  if (firstIn > 0 && firstIn + 1 <= lastIn) {
    const k = (top[firstIn + 1] - top[firstIn]) / (xs[firstIn + 1] - xs[firstIn]);
    for (let i = 0; i < firstIn; i++) if (top[firstIn] < h - 1e-6) top[i] = Math.min(top[i], h, top[firstIn] + k * (xs[i] - xs[firstIn]));
  }
  if (lastIn >= 1 && lastIn < N) {
    const k = (top[lastIn] - top[lastIn - 1]) / (xs[lastIn] - xs[lastIn - 1]);
    for (let i = lastIn + 1; i <= N; i++) if (top[lastIn] < h - 1e-6) top[i] = Math.min(top[i], h, top[lastIn] + k * (xs[i] - xs[lastIn]));
  }
  // simplify the top line (it is piecewise straight)
  const pts: P2[] = xs.map((x, i) => ({ x, y: top[i] }));
  const keep = simplify(pts, 0.02);
  const first = keep[0], last = keep[keep.length - 1];
  const s: WallSketch = { kind: 'wall', corners: {} };
  if (Math.abs(first.y - h) > 1e-6) s.corners!.tl = { dx: 0, dy: Math.round((first.y - h) * 1000) / 1000 };
  if (Math.abs(last.y - h) > 1e-6) s.corners!.tr = { dx: 0, dy: Math.round((last.y - h) * 1000) / 1000 };
  // interior vertices: inserts on the top edge, which runs from the (moved) top right corner to the top left one;
  // an insert sits at fraction t along that line, pushed `off` outward (perpendicular to it)
  const tr = { x: w, y: h + (s.corners!.tr?.dy ?? 0) }, tl = { x: 0, y: h + (s.corners!.tl?.dy ?? 0) };
  const dir = { x: tl.x - tr.x, y: tl.y - tr.y };
  const L2 = dir.x * dir.x + dir.y * dir.y, L = Math.sqrt(L2);
  const inw = { x: -dir.y / L, y: dir.x / L };
  const inserts = keep.slice(1, -1).map((q, k) => {
    const tpar = ((q.x - tr.x) * dir.x + (q.y - tr.y) * dir.y) / L2;
    const off = -((q.x - tr.x - dir.x * tpar) * inw.x + (q.y - tr.y - dir.y * tpar) * inw.y);
    return { id: `adapt${k}`, edge: 'e2' as const, t: Math.round(tpar * 1e9) / 1e9, off: Math.round(off * 1e6) / 1e6 };
  });
  // the side edges, trimmed where a board beside the ghost runs into one of its sides (BUGFIX_PLAN B18);
  // a trim reaching the bottom moves the bottom corner along the attached edge
  if (sides.e1.length && sides.e1[0].y < 1e-9) {
    s.corners!.br = { dx: Math.round((sides.e1.shift()!.x - w) * 1000) / 1000, dy: 0 };
  }
  if (sides.e3.length && sides.e3[0].y < 1e-9) {
    s.corners!.bl = { dx: Math.round(sides.e3.shift()!.x * 1000) / 1000, dy: 0 };
  }
  const cs = wallCornersOf(w, h, s);
  const sideIns = (edge: 'e1' | 'e3', a: P2, b: P2, pts: P2[]) => {
    const dir = { x: b.x - a.x, y: b.y - a.y };
    const L2 = dir.x * dir.x + dir.y * dir.y, L = Math.sqrt(L2);
    const out = { x: dir.y / L, y: -dir.x / L };
    return pts.map((q, k) => {
      const tpar = ((q.x - a.x) * dir.x + (q.y - a.y) * dir.y) / L2;
      const off = (q.x - a.x - dir.x * tpar) * out.x + (q.y - a.y - dir.y * tpar) * out.y;
      return { id: `adapt${edge}_${k}`, edge, t: Math.round(tpar * 1e9) / 1e9, off: Math.round(off * 1e6) / 1e6 };
    }).filter((x) => x.t > 1e-6 && x.t < 1 - 1e-6);
  };
  const all = [...inserts, ...sideIns('e1', cs[1], cs[2], sides.e1), ...sideIns('e3', cs[3], cs[0], [...sides.e3].reverse())];
  if (all.length) s.inserts = all;
  if (!Object.keys(s.corners!).length) delete s.corners;
  // never an outline that crosses itself: without the side trims, or nothing
  const ok = (k: WallSketch) => !crossesItself(sketchRing({ ...ghost, sketch: k }).map((e) => e.a));
  if (ok(s)) return s;
  if (s.inserts) s.inserts = s.inserts.filter((x) => x.edge === 'e2');
  if (!s.inserts?.length) delete s.inserts;
  if (s.corners) {
    delete s.corners.br;
    delete s.corners.bl;
    if (!Object.keys(s.corners).length) delete s.corners;
  }
  return ok(s) ? s : null;
}

/** How far a trimmed ghost stays clear of a board it is trimmed against at an angle. */
const gapOf = (d: Design, ghost: Panel) => Math.max(0.2, profileOf(d, ghost.material).clearance);

const wallCornersOf = (w: number, h: number, s: WallSketch): P2[] => {
  const c = s.corners ?? {};
  return [
    { x: c.bl?.dx ?? 0, y: 0 },
    { x: w + (c.br?.dx ?? 0), y: 0 },
    { x: w + (c.tr?.dx ?? 0), y: h + (c.tr?.dy ?? 0) },
    { x: c.tl?.dx ?? 0, y: h + (c.tl?.dy ?? 0) },
  ];
};


/**
 * Where boards beside a ghost run into its sides (a lid grown off one wall of a hexagonal box: the
 * angled walls next to that wall cross the lid's corners). For rows across the ghost, the stretch of
 * the row inside another board's slab, when it reaches exactly one side, trims that side. Returned
 * as the trimmed side lines (ghost-local points, bottom to top), each with an untrimmed point just
 * below and above, so the side follows the board's face; empty when nothing reaches a side. Boards
 * that meet the ghost's side edge at a corner joint, and stretches across the whole row (its parent),
 * are left alone.
 */
function sideTrims(d: Design, ghost: Panel, t: number): { e1: P2[]; e3: P2[] } {
  const w = ghost.w, h = ghost.h;
  const M = 400;
  const ys = Array.from({ length: M + 1 }, (_, j) => (h * j) / M);
  const left = ys.map(() => 0), right = ys.map(() => w);
  const gap = gapOf(d, ghost);
  for (const id of d.order) {
    const p = d.panels[id];
    if (!p) continue;
    if (panelEdges(p).some((e) => cornerFit(ghost, 'e1', p, e.key) || cornerFit(ghost, 'e3', p, e.key))) continue;
    const mp = matDir(p.frame), tp = tOf(d, id);
    const du = v3dot(ghost.frame.u, mp);
    if (Math.abs(du) < 1e-9) continue; // rows run along it: the top trim's business
    // a board square to the ghost's side (side walls holding a leaning panel) meets that side face-on: it is joined there, not trimmed
    if (Math.abs(du) > 0.99) continue;
    // the board as cut (its joints' fingers reach into the corner column)
    // and as sketched (the export check's contacts go by the sketch): inside either is in the way
    const rings = [panelOutline(p, panelNotches(d, p)), sketchRing(p).map((e) => e.a)];
    for (let j = 0; j <= M; j++)
      for (const zg of [0, t / 2, t]) {
        const base = toWorld(ghost.frame, 0, ys[j], zg);
        const d0 = v3dot(v3sub(base, p.frame.o), mp);
        // a little clear of the board's face, so the two do not touch
        const xa = Math.min(-d0 / du, (tp - d0) / du) - gap, xb = Math.max(-d0 / du, (tp - d0) / du) + gap;
        if (xb <= 1e-6 || xa >= w - 1e-6) continue;
        const atLeft = xa <= 1e-6, atRight = xb >= w - 1e-6;
        if (atLeft === atRight) continue; // inside the row (the top trim's) or across all of it (its parent)
        // part of that stretch must be in the board (its joints' notches leave gaps along it)
        const x0 = Math.max(0, xa), x1 = Math.min(w, xb);
        let inside = false;
        for (let k = 0; k <= 8 && !inside; k++) {
          const q = toLocal(p.frame, toWorld(ghost.frame, x0 + ((x1 - x0) * k) / 8, ys[j], zg));
          inside = rings.some((r) => pointInPolygon(q, r));
        }
        if (!inside) continue;
        if (atLeft) left[j] = Math.max(left[j], Math.min(xb, w / 2));
        else right[j] = Math.min(right[j], Math.max(xa, w / 2));
      }
  }
  // between two rows the face may reach further than either sample: take the deeper of the neighbours
  const deeper = (v: number[], pick: (a: number, b: number) => number) => v.map((x, j) => pick(x, pick(v[Math.max(0, j - 1)], v[Math.min(M, j + 1)])));
  const L = deeper(left, Math.max), R = deeper(right, Math.min);
  left.splice(0, left.length, ...L);
  right.splice(0, right.length, ...R);
  const line = (trim: number[], at: (j: number) => number) => {
    const rows = trim.map((v, j) => (Math.abs(v - at(j)) > 1e-3 ? j : -1)).filter((j) => j >= 0);
    if (!rows.length) return [] as P2[];
    const j0 = Math.max(0, rows[0] - 1), j1 = Math.min(M, rows[rows.length - 1] + 1);
    const pts: P2[] = [];
    for (let j = j0; j <= j1; j++) pts.push({ x: trim[j], y: ys[j] });
    // the first and last points are on the untrimmed side unless the trim reaches the corner
    return simplify(pts, 0.02).filter((q) => q.y < h - 1e-9);
  };
  return { e1: line(right, () => w), e3: line(left, () => 0) };
}

/** Douglas–Peucker on an open polyline. */
function simplify(pts: P2[], tol: number): P2[] {
  if (pts.length <= 2) return pts;
  const a = pts[0], b = pts[pts.length - 1];
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  let worst = 0, at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const dd = Math.abs((pts[i].x - a.x) * (b.y - a.y) - (pts[i].y - a.y) * (b.x - a.x)) / L;
    if (dd > worst) [worst, at] = [dd, i];
  }
  if (worst <= tol) return [a, b];
  return [...simplify(pts.slice(0, at + 1), tol).slice(0, -1), ...simplify(pts.slice(at), tol)];
}

/** Panels a ghost on this edge starts against (left out of trimming): its parent and the panels at its ends. */
export function ghostNeighbours(d: Design, parentId: string): Set<string> {
  const out = new Set([parentId]);
  for (const c of Object.values(d.connections)) if (c.a.panelId === parentId || c.b.panelId === parentId) out.add(c.a.panelId === parentId ? c.b.panelId : c.a.panelId);
  return out;
}

export { segDir, segInward };

/**
 * Hinge angles (0–360°, see hinge.ts) at which a ghost of height h on this
 * edge would rest its free edge on a corner of another panel within its span:
 * the angle snap targets while the hinge dial is dragged.
 */
export function angleTargets(d: Design, parentId: string, edge: string, h: number, offset: number, span?: [number, number] | null): number[] {
  const parent = d.panels[parentId];
  const e = parent && findEdge(parent, edge);
  if (!e) return [];
  const L = segLength(e);
  const [s0, s1] = spanOf(parent, edge, span);
  const inl = segInward(e);
  const a3 = toWorld(parent.frame, e.a.x + inl.x * offset, e.a.y + inl.y * offset);
  const b3 = toWorld(parent.frame, e.b.x + inl.x * offset, e.b.y + inl.y * offset);
  const U = v3mul(v3sub(b3, a3), 1 / L);
  const dIn = v3add(v3mul(parent.frame.u, inl.x), v3mul(parent.frame.v, inl.y));
  const up = matDir(parent.frame);
  const out = new Set<number>();
  for (const id of d.order) {
    const p = d.panels[id];
    if (!p || id === parentId) continue;
    for (const q of panelEdges(p))
      for (const z of [0, tOf(d, id)]) {
        const r = v3sub(toWorld(p.frame, q.a.x, q.a.y, z), a3);
        const s = v3dot(r, U);
        if (s < s0 - 1e-6 || s > s1 + 1e-6) continue;
        const x = v3dot(r, dIn), y = v3dot(r, up);
        if (Math.abs(Math.hypot(x, y) - h) > Math.max(1, 0.03 * h)) continue;
        const a = (((Math.atan2(y, x) * 180) / Math.PI) % 360 + 360) % 360;
        if (a > 1 && a < 359) out.add(Math.round(a * 10) / 10);
      }
  }
  return [...out].sort((x, y) => x - y);
}
