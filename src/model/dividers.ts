// Dividers. Milestone 44 (DIVIDERS_PLAN.md): a divider is a board standing on
// its base, drawn as a line (`Panel.divider`); each end runs to the first
// board beyond where the line reached, crossing the dividers it passes. The
// ends are found again on every solve (`reconcileDividers`), so moving,
// turning, adding or deleting boards stretches the dividers that meet them.
// Also: the clear inside of a rectangular base, even spacing, and snapping a
// dragged divider to equal compartments.
import type { Design, DividerRec, P2, Panel, PanelPlace } from './types';
import { pieceRoot, placementPiece } from './keys';
import { findEdge, isRectSketch, panelEdges, rectSketch, sketchOf } from './edges';
import { matDir, toLocal, toWorld } from './frame';
import { tOf } from './materials';
import { spanFrame, spanOf } from './adapt';
import { constructionSet, placeFrame } from './place';
import { pointInPolygon } from '../geom/vec';

export const MIN_COMPARTMENT = 5;

/** The clear inside of a rectangular base between the walls on its edges (base-local), or null. */
export function clearBox(d: Design, baseId: string): { x0: number; x1: number; y0: number; y1: number } | null {
  const base = d.panels[baseId];
  if (!base || !isRectSketch(base)) return null;
  const t = tOf(d, baseId);
  const inner = (key: string) => {
    // a wall at the edge (not a divider standing in from it)
    const c = Object.values(d.connections).find((x) => x.grown && x.a.panelId === baseId && x.a.edge === key && Math.abs(x.angle - 90) < 1e-6 && x.dir === 'up' && x.offset <= Math.max(t, 6) + 1e-6 );
    return c ? c.offset + t : 0;
  };
  return { x0: inner('e3'), x1: base.w - inner('e1'), y0: inner('e0'), y1: base.h - inner('e2') };
}

/** Slab starts (offsets from the edge) for n dividers of thickness t in [lo, hi]. */
export function spacedOffsets(lo: number, hi: number, n: number, t: number, mode: 'even' | 'size' = 'even', size?: number): number[] {
  if (mode === 'size' && size && size > 0) {
    // as many compartments of `size` as fit while the last one keeps at least MIN_COMPARTMENT
    const m = Math.max(0, Math.floor((hi - lo - MIN_COMPARTMENT) / (size + t) + 1e-9));
    return Array.from({ length: m }, (_, k) => lo + (k + 1) * size + k * t);
  }
  if (n <= 0) return [];
  const c = (hi - lo - n * t) / (n + 1);
  return Array.from({ length: n }, (_, k) => lo + (k + 1) * c + k * t);
}

/** Rename a panel everywhere it is referred to. */
export function renamePanel(d: Design, from: string, to: string) {
  const p = d.panels[from];
  if (!p || d.panels[to]) return;
  delete d.panels[from];
  p.id = to;
  d.panels[to] = p;
  d.order = d.order.map((x) => (x === from ? to : x));
  if (d.pieces[from]) {
    d.pieces[to] = d.pieces[from];
    delete d.pieces[from];
  }
  for (const k of Object.keys(d.placements)) {
    // the panel's piece and its fragments (`<id>@n`)
    const key = placementPiece(k);
    if (pieceRoot(key) === from) {
      d.placements[`${to}${k.slice(from.length)}`] = d.placements[k];
      delete d.placements[k];
    }
  }
  for (const c of Object.values(d.connections)) {
    if (c.a.panelId === from) c.a.panelId = to;
    if (c.b.panelId === from) c.b.panelId = to;
    if (c.geom) for (const list of [c.geom.edges, c.geom.holes, c.geom.adds, c.geom.scores, c.geom.flaps3d, c.geom.cuts ?? []] as { panelId: string }[][]) for (const x of list) if (x.panelId === from) x.panelId = to;
    for (const f of c.geom?.flaps3d ?? []) if (f.owner === from) f.owner = to;
  }
  if (d.noAutoSeams) d.noAutoSeams = d.noAutoSeams.map((k) => k.split('|').map((x) => (x === from ? to : x)).sort().join('|'));
  // boards placed on it (and dividers standing on it) keep their host
  for (const q of Object.values(d.panels)) if (q.place?.host === from) q.place = { ...q.place, host: to };
  for (const tr of Object.values(d.trays ?? {})) if (tr.baseId === from) tr.baseId = to;
  for (const c of d.contents ?? []) if (c.baseId === from) c.baseId = to;
}

/** Snap a divider's offset: equal compartments either side, even spacing of the whole row, or a neighbouring compartment's width. */
export function snapDividerOffset(row: { lo: number; hi: number; others: number[] }, off: number, t: number, tol: number): number | null {
  const ends = [row.lo, ...row.others.map((o) => o + t)].filter((x) => off + 1e-9 >= x).sort((a, b) => b - a);
  const starts = [row.hi, ...row.others].filter((st) => st >= off + t - 1e-9).sort((a, b) => a - b);
  const L = ends[0] ?? row.lo, R = starts[0] ?? row.hi;
  const cands: number[] = [(L + R - t) / 2];
  const n = row.others.length + 1;
  const c = (row.hi - row.lo - n * t) / (n + 1);
  for (let k = 0; k < n; k++) cands.push(row.lo + (k + 1) * c + k * t);
  // a neighbouring compartment's width, repeated
  const L2 = [row.lo, ...row.others.map((o) => o + t)].filter((x) => L - 1e-9 > x).sort((a, b) => b - a)[0];
  if (L2 !== undefined) cands.push(L + (L - t - L2));
  const R2 = [row.hi, ...row.others].filter((st) => st > R + 1e-9).sort((a, b) => a - b)[0];
  if (R2 !== undefined) cands.push(R - (R2 - (R + t)) - t);
  let best: number | null = null;
  for (const x of cands) if (Math.abs(x - off) <= tol && (best === null || Math.abs(x - off) < Math.abs(best - off))) best = x;
  return best;
}

// ---------------------------------------------------------------------------
// Milestone 44: dividers that find their own ends.

/** Smallest angle (degrees) at which a divider crosses another one with half-laps; shallower, it stops at it. */
export const MIN_CROSS = 30;
/** Shortest divider (mm). */
const MIN_DIVIDER = 5;

export const isDivider = (p: Panel | undefined): p is Panel & { divider: DividerRec; place: PanelPlace } => !!p?.divider && !!p.place;

const rad = (deg: number) => (deg * Math.PI) / 180;
const dirOf = (rot: number): P2 => ({ x: Math.cos(rad(rot)), y: Math.sin(rad(rot)) });
const r6 = (v: number) => Math.round(v * 1e6) / 1e6 + 0;

/** A board standing on a base, as its footprint on the base (base-local, a convex quad) and its direction. */
export type Footprint = { id: string; quad: P2[]; dir: P2; divider: boolean };

/** The material direction (base-local, unit) of a board standing on `baseId` along `rot` with its material on `side`. */
export function standingMat(d: Design, baseId: string, rot: number, side: 1 | -1): P2 {
  const base = d.panels[baseId];
  const f = placeFrame(d, { host: baseId, face: 1, x: 0, y: 0, rot, pose: 'standing', side });
  if (!base || !f) return { x: 0, y: 0 };
  const m = matDir(f), u = base.frame.u, v = base.frame.v;
  const q = { x: m[0] * u[0] + m[1] * u[1] + m[2] * u[2], y: m[0] * v[0] + m[1] * v[1] + m[2] * v[2] };
  const l = Math.hypot(q.x, q.y) || 1;
  return { x: q.x / l, y: q.y / l };
}

/**
 * The boards standing square on a base's top face, as footprints, worked out
 * from the model (not from frames a solve has yet to update): walls grown
 * from its edges, boards placed standing on it, and the dividers in `dividers`
 * (the ones already placed in this pass). Guides are left out.
 */
export function footprints(d: Design, baseId: string, dividers: Set<string>, skip?: string): Footprint[] {
  const base = d.panels[baseId];
  if (!base) return [];
  const guides = constructionSet(d);
  const out: Footprint[] = [];
  const up = matDir(base.frame);
  const add = (id: string, f: Panel['frame'], x0: number, x1: number, divider: boolean) => {
    if (Math.abs(f.v[0] * up[0] + f.v[1] * up[1] + f.v[2] * up[2]) < 0.999) return;
    const t = tOf(d, id);
    const q = (x: number, z: number) => toLocal(base.frame, toWorld(f, x, 0, z));
    const quad = [q(x0, 0), q(x1, 0), q(x1, t), q(x0, t)];
    const L = Math.hypot(quad[1].x - quad[0].x, quad[1].y - quad[0].y) || 1;
    out.push({ id, quad, dir: { x: (quad[1].x - quad[0].x) / L, y: (quad[1].y - quad[0].y) / L }, divider });
  };
  for (const c of Object.values(d.connections)) {
    if (!c.grown || c.a.panelId !== baseId || Math.abs(c.angle - 90) > 1e-6 || c.dir !== 'up') continue;
    const w = d.panels[c.b.panelId];
    if (!w || w.id === skip || guides.has(w.id) || !findEdge(base, c.a.edge)) continue;
    const span = c.trayId ? null : c.span;
    const [s0, s1] = spanOf(base, c.a.edge, span);
    const f = spanFrame(base, c.a.edge, 90, 'up', tOf(d, baseId), c.kind === 'finger' ? 'overlap' : 'onTop', c.offset, span, tOf(d, w.id));
    add(w.id, f, -(w.ext?.s ?? 0), s1 - s0 + (w.ext?.e ?? 0), false);
  }
  for (const id of d.order) {
    const p = d.panels[id];
    if (!p || id === skip || guides.has(id) || p.place?.host !== baseId || p.place.pose !== 'standing' || p.place.face !== 1) continue;
    if (p.divider && !dividers.has(id)) continue;
    const f = placeFrame(d, p.place);
    if (!f) continue;
    const xs = panelEdges(p).map((e) => e.a.x);
    add(id, f, Math.min(...xs), Math.max(...xs), !!p.divider);
  }
  return out;
}

/** Where the line o + t·dir runs through a convex polygon: [enter, exit], or null. */
export function clipLine(o: P2, dir: P2, poly: P2[]): [number, number] | null {
  let area = 0;
  for (let i = 0; i < poly.length; i++) area += poly[i].x * poly[(i + 1) % poly.length].y - poly[(i + 1) % poly.length].x * poly[i].y;
  const sgn = area >= 0 ? 1 : -1;
  let t0 = -Infinity, t1 = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    // outward normal of a CCW edge is (dy, -dx)
    const n = { x: (b.y - a.y) * sgn, y: -(b.x - a.x) * sgn };
    const num = n.x * (o.x - a.x) + n.y * (o.y - a.y);
    const den = n.x * dir.x + n.y * dir.y;
    if (Math.abs(den) < 1e-12) {
      if (num > 1e-9) return null;
      continue;
    }
    const t = -num / den;
    if (den > 0) t1 = Math.min(t1, t);
    else t0 = Math.max(t0, t);
  }
  return t1 - t0 > 1e-9 ? [t0, t1] : null;
}

/** The stretch of the line o + t·dir inside the base's outline around t = 0, or null when o is outside it. */
function insideBase(d: Design, baseId: string, o: P2, dir: P2): [number, number] | null {
  const ring = panelEdges(d.panels[baseId]).map((e) => e.a);
  if (!pointInPolygon(o, ring)) return null;
  let lo = -Infinity, hi = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const e = { x: b.x - a.x, y: b.y - a.y };
    const den = dir.x * e.y - dir.y * e.x;
    if (Math.abs(den) < 1e-12) continue;
    const w = { x: a.x - o.x, y: a.y - o.y };
    const t = (w.x * e.y - w.y * e.x) / den, k = (w.x * dir.y - w.y * dir.x) / den;
    if (k < -1e-9 || k > 1 + 1e-9) continue;
    if (t < 0) lo = Math.max(lo, t);
    else hi = Math.min(hi, t);
  }
  return Number.isFinite(lo) && Number.isFinite(hi) ? [lo, hi] : null;
}

/** What one end of a divider meets: a board (its id), or the base's edge (null). */
export type DividerEnd = { at: number; board: string | null };
export type DividerSpan = {
  /** Its stretch along the line from its anchor on the board's plane (t0 < 0 < t1 when the anchor is inside). */
  t0: number;
  t1: number;
  /** The plane line's anchor (base-local): `at` moved half a thickness off the mid-plane. */
  o: P2;
  dir: P2;
  ends: [DividerEnd, DividerEnd];
  /** Dividers it crosses (half-laps). */
  crosses: string[];
  /** An end meets its board at less than MIN_CROSS: no laser-cut joint holds it there. */
  shallow: boolean;
};

/**
 * Where a divider drawn as `rec` on `baseId` ends: along its line each way,
 * the far face of the first board it meets beyond its reach (or of any board
 * that is not a divider, or a divider it would cross at less than
 * `MIN_CROSS`), else the base's edge. Dividers wholly within its reach are
 * crossed. Null when its anchor is off the base or it would be too short.
 */
export function dividerSpan(d: Design, baseId: string, rec: DividerRec, t: number, side: 1 | -1, dividers: Set<string>, self?: string): DividerSpan | null {
  if (!d.panels[baseId]) return null;
  const dir = dirOf(rec.rot);
  const m = standingMat(d, baseId, rec.rot, side);
  const o = { x: rec.at.x - (m.x * t) / 2, y: rec.at.y - (m.y * t) / 2 };
  const inside = insideBase(d, baseId, rec.at, dir);
  if (!inside) return null;
  const feet = footprints(d, baseId, dividers, self)
    .map((f) => ({ f, r: clipLine(o, dir, f.quad) }))
    .filter((x): x is { f: Footprint; r: [number, number] } => !!x.r);
  const sinMin = Math.sin(rad(MIN_CROSS)) - 1e-6;
  const steep = (f: Footprint) => Math.abs(dir.x * f.dir.y - dir.y * f.dir.x) >= sinMin;
  const crossable = (f: Footprint) => f.divider && steep(f);
  let shallow = false;
  const crosses: string[] = [];
  // a board its anchor lies in: a divider it crosses there, or (a wall, a shallow crossing) no place for it
  for (const { f, r } of feet) {
    if (!(r[0] < -1e-6 && r[1] > 1e-6)) continue;
    if (!crossable(f)) return null;
    crosses.push(f.id);
  }
  const end = (s: 1 | -1): DividerEnd => {
    const reach = s === 1 ? rec.reach[1] : -rec.reach[0];
    const limit = s === 1 ? inside[1] : -inside[0];
    const ahead = feet
      .map(({ f, r }) => ({ f, enter: s === 1 ? r[0] : -r[1], exit: s === 1 ? r[1] : -r[0] }))
      // the boards ahead (one its anchor lies in was dealt with above)
      .filter((x) => x.exit > 1e-6 && x.enter > -1e-6)
      .sort((a, b) => a.enter - b.enter);
    for (const x of ahead) {
      if (x.enter >= limit - 1e-6) break;
      if (crossable(x.f) && x.exit < reach - 1e-6) {
        if (!crosses.includes(x.f.id)) crosses.push(x.f.id);
        continue;
      }
      if (!steep(x.f)) shallow = true;
      return { at: x.exit, board: x.f.id };
    }
    return { at: limit, board: null };
  };
  const hi = end(1), lo = end(-1);
  const t0 = -lo.at, t1 = hi.at;
  if (t1 - t0 < MIN_DIVIDER) return null;
  return { t0, t1, o, dir, ends: [lo, hi], crosses, shallow };
}

/** Change a board's width, keeping its outline (a rectangle stays one; an edited outline stretches along x). */
function setWidth(p: Panel, w: number) {
  if (Math.abs(p.w - w) < 1e-9) return;
  if (isRectSketch(p)) p.sketch = rectSketch(w, p.h);
  else {
    const s = sketchOf(p);
    if (s.kind === 'poly') s.pts = s.pts.map((q) => ({ ...q, x: (q.x / (p.w || 1)) * w }));
  }
  p.w = w;
}

/**
 * Find every divider's ends again (run by `solve` before frames are derived),
 * in creation order: each sees the walls and boards on its base and the
 * dividers made before it. A divider whose base went is left as a standing
 * board; one that cannot be laid out keeps its last place, flagged broken.
 */
export function reconcileDividers(d: Design) {
  const done = new Map<string, Set<string>>();
  for (const id of d.order) {
    const p = d.panels[id];
    if (!p?.divider) continue;
    const base = p.place?.host;
    if (!p.place || p.place.pose !== 'standing' || !base || !d.panels[base]) {
      delete p.divider;
      continue;
    }
    const seen = done.get(base) ?? new Set<string>();
    done.set(base, seen);
    const sp = dividerSpan(d, base, p.divider, tOf(d, id), p.place.side ?? 1, seen, id);
    seen.add(id);
    if (!sp) {
      p.broken = true;
      continue;
    }
    delete p.broken;
    const at = { x: sp.o.x + sp.dir.x * sp.t0, y: sp.o.y + sp.dir.y * sp.t0 };
    p.place = { ...p.place, face: 1, pose: 'standing', x: r6(at.x), y: r6(at.y), rot: p.divider.rot };
    setWidth(p, r6(sp.t1 - sp.t0));
  }
}

/** The span a divider has now (as `reconcileDividers` found it), for the card and the stage. */
export function dividerSpanOf(d: Design, id: string): DividerSpan | null {
  const p = d.panels[id];
  if (!isDivider(p) || !p.place.host) return null;
  const before = new Set(d.order.slice(0, d.order.indexOf(id)).filter((x) => isDivider(d.panels[x]) && d.panels[x].place?.host === p.place.host));
  return dividerSpan(d, p.place.host, p.divider, tOf(d, id), p.place.side ?? 1, before, id);
}

/**
 * A grown panel standing in from its base's edge at 90° (how dividers were
 * made before milestone 44) as a divider record and placement that put it
 * exactly where it is: its mid-plane through its middle, reaching almost to
 * its ends, so its ends find the same boards. Null when it is not one.
 */
export function legacyDivider(d: Design, panelId: string): { place: PanelPlace; divider: DividerRec } | null {
  const c = Object.values(d.connections).find((x) => x.grown && x.b.panelId === panelId);
  const p = d.panels[panelId];
  const base = c && d.panels[c.a.panelId];
  if (!c || !p || !base || c.trayId || Math.abs(c.angle - 90) > 1e-6 || c.dir !== 'up' || c.kind === 'finger') return null;
  // only on a base (not grown itself), and not one piece of a wall set
  if (Object.values(d.connections).some((x) => x.grown && x.b.panelId === base.id) || /~\d+$/.test(panelId) || c.a.edge.includes('#')) return null;
  const F = p.frame, H = base.frame;
  const o = toLocal(H, F.o);
  const ux = F.u[0] * H.u[0] + F.u[1] * H.u[1] + F.u[2] * H.u[2], uy = F.u[0] * H.v[0] + F.u[1] * H.v[1] + F.u[2] * H.v[2];
  const rot = r6((Math.atan2(uy, ux) * 180) / Math.PI);
  const place: PanelPlace = { host: base.id, face: 1, x: o.x, y: o.y, rot, pose: 'standing', side: F.side };
  // it must stand where a placed board would: on the base's top face, upright
  const f = placeFrame(d, place);
  if (!f || [0, 1, 2].some((i) => Math.abs(f.o[i] - F.o[i]) > 1e-6 || Math.abs(f.u[i] - F.u[i]) > 1e-6 || Math.abs(f.v[i] - F.v[i]) > 1e-6) || f.side !== F.side) return null;
  const t = tOf(d, panelId);
  const mid = toLocal(H, toWorld(F, p.w / 2, 0, t / 2));
  const r = Math.max(p.w / 4, p.w / 2 - 1);
  return { place, divider: { at: { x: r6(mid.x), y: r6(mid.y) }, rot, reach: [-r, r] } };
}

/** A divider's unit direction and normal (base-local); the normal points to the side its material is not on. */
export function dividerAxes(d: Design, id: string): { dir: P2; n: P2 } | null {
  const p = d.panels[id];
  if (!isDivider(p)) return null;
  const dir = dirOf(p.divider.rot);
  return { dir, n: { x: -dir.y, y: dir.x } };
}

/** A board along a divider's normal: where its slab starts and ends (along n), and whether it is a divider. */
type RowHit = { id: string; s0: number; s1: number; divider: boolean };

/**
 * The row a divider stands in, along its normal through its middle: the
 * nearest board that is not a divider on either side (`lo`, `hi`: their near
 * faces; else the base's edge), and the parallel dividers between them
 * (`others`: where their slabs start). `pos` is where its own slab starts.
 * All are distances along `n` in the base's coordinates.
 */
export function dividerRow(d: Design, id: string): { baseId: string; n: P2; lo: number; hi: number; others: number[]; otherIds: string[]; pos: number; t: number } | null {
  const p = d.panels[id];
  const ax = dividerAxes(d, id);
  if (!isDivider(p) || !ax || !p.place.host) return null;
  const baseId = p.place.host;
  const t = tOf(d, id);
  const { n, dir } = ax;
  const at = p.divider.at;
  const c = at.x * n.x + at.y * n.y;
  const inside = insideBase(d, baseId, at, n);
  if (!inside) return null;
  const all = new Set(d.order.filter((x) => isDivider(d.panels[x])));
  const hits: RowHit[] = [];
  for (const f of footprints(d, baseId, all, id)) {
    if (Math.abs(dir.x * f.dir.y - dir.y * f.dir.x) > 0.02) continue;
    const r = clipLine(at, n, f.quad);
    if (r) hits.push({ id: f.id, s0: c + r[0], s1: c + r[1], divider: f.divider });
  }
  let lo = c + inside[0], hi = c + inside[1];
  for (const h of hits) if (!h.divider && h.s1 <= c + 1e-6) lo = Math.max(lo, h.s1);
  for (const h of hits) if (!h.divider && h.s0 >= c - 1e-6) hi = Math.min(hi, h.s0);
  const row = hits.filter((h) => h.divider && h.s0 >= lo - 1e-6 && h.s1 <= hi + 1e-6).sort((a, b) => a.s0 - b.s0);
  return { baseId, n, lo, hi, others: row.map((h) => h.s0), otherIds: row.map((h) => h.id), pos: c - t / 2, t };
}

/** Move a divider along its normal so its slab starts at `pos` (as `dividerRow` measures it). */
export function setDividerPos(d: Design, id: string, pos: number) {
  const p = d.panels[id];
  const ax = dividerAxes(d, id);
  if (!isDivider(p) || !ax) return;
  const t = tOf(d, id);
  const c = p.divider.at.x * ax.n.x + p.divider.at.y * ax.n.y;
  const k = pos + t / 2 - c;
  p.divider = { ...p.divider, at: { x: r6(p.divider.at.x + ax.n.x * k), y: r6(p.divider.at.y + ax.n.y * k) } };
}

/** Is a board a divider standing on this base? */
export const dividersOn = (d: Design, baseId: string): string[] => d.order.filter((id) => isDivider(d.panels[id]) && d.panels[id].place?.host === baseId);
