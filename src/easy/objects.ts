// What goes inside (milestone 40): everyday objects as boxes (W × D × H mm),
// the compartments of a box (its clear inside split by its dividers), and
// whether an object fits a compartment with the material's clearance.
import type { Content, Design, P2 } from '../model/types';
import type { MsgKey } from '../i18n';
import polygonClipping from 'polygon-clipping';
import { dividersOn, footprints, MIN_COMPARTMENT } from '../model/dividers';
import { matOf, tOf } from '../model/materials';
import { matDir, toWorld } from '../model/frame';
import { panelEdges } from '../model/edges';
import { pointInPolygon, polygonArea } from '../geom/vec';

export type ObjectDef = { id: string; key: MsgKey; w: number; d: number; h: number };

/** Sizes of the things students put in boxes (mm: length or width, depth, height as it lies). */
export const OBJECTS: ObjectDef[] = [
  { id: 'pencil', key: 'obj.pencil', w: 178, d: 8, h: 8 },
  { id: 'marker', key: 'obj.marker', w: 140, d: 18, h: 18 },
  { id: 'dice', key: 'obj.dice', w: 16, d: 16, h: 16 },
  { id: 'deck', key: 'obj.deck', w: 64, d: 89, h: 18 },
  { id: 'phone', key: 'obj.phone', w: 72, d: 150, h: 9 },
  { id: 'coin', key: 'obj.coin', w: 24, d: 24, h: 2 },
  { id: 'custom', key: 'obj.custom', w: 50, d: 30, h: 20 },
];
export const objectById = (id: string) => OBJECTS.find((o) => o.id === id) ?? OBJECTS[OBJECTS.length - 1];

/** One object's size: the library's, or a custom one's own. */
export function sizeOf(c: Content): { w: number; d: number; h: number } {
  const o = objectById(c.object);
  return { w: c.w ?? o.w, d: c.d ?? o.d, h: c.h ?? o.h };
}

/** A compartment: a rectangle of a base's clear inside (base-local), and how tall it is inside. */
export type Compartment = { baseId: string; x0: number; y0: number; x1: number; y1: number; h: number; poly?: P2[] };

/** The bases that are boxes: a base with walls standing on its edges. */
export function boxBases(d: Design): string[] {
  return d.order.filter((id) => {
    const p = d.panels[id];
    if (!p || Object.values(d.connections).some((c) => c.grown && c.b.panelId === id)) return false;
    return Object.values(d.connections).filter((c) => c.grown && c.a.panelId === id && Math.abs(c.angle - 90) < 1e-6 && c.dir === 'up' && c.offset <= Math.max(tOf(d, id), 6) + 1e-6).length >= 3;
  });
}

/** How tall the inside is: the lowest wall's top above the base's top face. */
function insideHeight(d: Design, baseId: string): number {
  const base = d.panels[baseId];
  const m = matDir(base.frame), o = base.frame.o, t = tOf(d, baseId);
  let low = Infinity;
  for (const c of Object.values(d.connections)) {
    if (!c.grown || c.a.panelId !== baseId || Math.abs(c.angle - 90) > 1e-6 || c.dir !== 'up' || c.offset > Math.max(t, 6) + 1e-6) continue;
    const p = d.panels[c.b.panelId];
    let hi = -Infinity;
    for (const [x, y] of [[0, p.h], [p.w, p.h], [p.w / 2, p.h]]) {
      const w = toWorld(p.frame, x, y);
      hi = Math.max(hi, (w[0] - o[0]) * m[0] + (w[1] - o[1]) * m[1] + (w[2] - o[2]) * m[2]);
    }
    low = Math.min(low, hi);
  }
  return Number.isFinite(low) ? low - t : 0;
}

/**
 * A box's compartments (milestone 44): its base's outline less the footprint
 * of every board standing on it (walls, dividers, standing boards), each
 * region that is left one compartment. A compartment's rectangle is the
 * region itself when it is a rectangle along the base's axes, else the
 * largest rectangle centred in it (approximately); `poly` is the region.
 * Slivers narrower than MIN_COMPARTMENT (outside a wall standing in from the
 * edge) are not compartments.
 */
export function compartments(d: Design, baseId: string): Compartment[] {
  const base = d.panels[baseId];
  if (!base) return [];
  const h = insideHeight(d, baseId);
  const outline = panelEdges(base).map((e) => e.a);
  const ring = (pts: P2[]) => pts.map((q) => [q.x, q.y] as [number, number]);
  const feet = footprints(d, baseId, new Set(dividersOn(d, baseId)));
  let regions: P2[][] = [outline];
  if (feet.length) {
    try {
      const res = polygonClipping.difference([ring(outline)], ...feet.map((f) => [ring(f.quad)]));
      regions = res.map((poly) => poly[0].slice(0, -1).map(([x, y]) => ({ x, y })));
    } catch {
      regions = [outline];
    }
  }
  const out: Compartment[] = [];
  for (const reg of regions) {
    if (reg.length < 3) continue;
    const xs = reg.map((q) => q.x), ys = reg.map((q) => q.y);
    const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
    // a rectangle along the base's axes is its own compartment
    const area = Math.abs(polygonArea(reg));
    const r = Math.abs(area - (bx1 - bx0) * (by1 - by0)) < 1e-3 ? { x0: bx0, x1: bx1, y0: by0, y1: by1 } : centredRect(reg);
    if (!r || Math.min(r.x1 - r.x0, r.y1 - r.y0) < MIN_COMPARTMENT - 1e-6) continue;
    out.push({ baseId, ...r, h, poly: reg });
  }
  // in the base's own order: rows from y = 0, then along x
  return out.sort((a, b) => (Math.abs(a.y0 - b.y0) > 1e-6 ? a.y0 - b.y0 : a.x0 - b.x0));
}

/** The largest rectangle (along the base's axes, keeping the region's proportions) centred in a region. */
function centredRect(reg: P2[]): { x0: number; x1: number; y0: number; y1: number } | null {
  const xs = reg.map((q) => q.x), ys = reg.map((q) => q.y);
  const W = Math.max(...xs) - Math.min(...xs), H = Math.max(...ys) - Math.min(...ys);
  // the centroid of the region
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < reg.length; i++) {
    const p = reg[i], q = reg[(i + 1) % reg.length];
    const k = p.x * q.y - q.x * p.y;
    a += k;
    cx += (p.x + q.x) * k;
    cy += (p.y + q.y) * k;
  }
  if (Math.abs(a) < 1e-9) return null;
  cx /= 3 * a;
  cy /= 3 * a;
  const fits = (s: number) => [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]].every(([i, j]) => pointInPolygon({ x: cx + (i * s * W) / 2, y: cy + (j * s * H) / 2 }, reg));
  let s = 0;
  for (let k = 0.5; k >= 0.002; k /= 2) if (fits(s + k)) s += k;
  return s > 0 ? { x0: cx - (s * W) / 2, x1: cx + (s * W) / 2, y0: cy - (s * H) / 2, y1: cy + (s * H) / 2 } : null;
}

/** Is a point (an object's centre) in a compartment: in its region, or its rectangle when it has none? */
export const inCell = (k: Compartment, q: P2) => (k.poly ? pointInPolygon(q, k.poly) : q.x >= k.x0 && q.x <= k.x1 && q.y >= k.y0 && q.y <= k.y1);

/** How many of an object fit in a compartment, lying flat either way round, stacked (with the clearance around the lot). */
export function capacity(d: Design, cell: Compartment, o: { w: number; d: number; h: number }): number {
  const c = matOf(d, cell.baseId).clearance;
  const W = cell.x1 - cell.x0 - 2 * c, D = cell.y1 - cell.y0 - 2 * c, H = cell.h - c;
  if (W <= 0 || D <= 0 || H <= 0) return 0;
  const n = (a: number, b: number) => Math.floor(W / a + 1e-9) * Math.floor(D / b + 1e-9);
  return Math.max(n(o.w, o.d), n(o.d, o.w)) * Math.floor(H / o.h + 1e-9);
}

export type Fit = { ok: boolean; cell: Compartment | null; need: { w: number; d: number; h: number } };

/** Does a placed object (with its count) fit the compartment it is in? If not, how much more room it needs (mm). */
export function contentFit(d: Design, c: Content): Fit {
  const cells = compartments(d, c.baseId);
  const cell = cells.find((k) => inCell(k, c)) ?? null;
  const s = sizeOf(c);
  if (!cell) return { ok: false, cell: null, need: { w: 0, d: 0, h: 0 } };
  const n = c.count ?? 1;
  if (capacity(d, cell, s) >= n) return { ok: true, cell, need: { w: 0, d: 0, h: 0 } };
  // the room missing for the lot laid out as they would be: along its length, stacked as high as fits, then in more rows
  const cl = matOf(d, c.baseId).clearance;
  const W = cell.x1 - cell.x0, D = cell.y1 - cell.y0;
  const turn = s.w > s.d ? W < D : W > D;
  const [ow, od] = turn ? [s.d, s.w] : [s.w, s.d];
  const across = Math.max(1, Math.floor((W - 2 * cl) / ow + 1e-9));
  const layers = Math.floor((cell.h - cl) / s.h + 1e-9);
  const rows = layers > 0 ? Math.ceil(n / (across * layers)) : 1;
  const r = (v: number) => Math.max(0, Math.round(v * 10) / 10);
  return { ok: false, cell, need: { w: r(ow + 2 * cl - W), d: r(rows * od + 2 * cl - D), h: layers > 0 ? 0 : r(s.h + cl - cell.h) } };
}

/** The compartment an object is placed in first: the smallest one it fits, else the largest. */
export function bestCell(d: Design, baseId: string, o: { w: number; d: number; h: number }, count = 1, taken: Compartment[] = []): Compartment | null {
  const same = (a: Compartment, b: Compartment) => Math.abs(a.x0 - b.x0) < 1e-6 && Math.abs(a.y0 - b.y0) < 1e-6;
  const all = compartments(d, baseId);
  // a compartment no other object is in yet, when there is one
  const free = all.filter((k) => !taken.some((x) => same(x, k)));
  const cells = free.length ? free : all;
  const area = (k: Compartment) => (k.x1 - k.x0) * (k.y1 - k.y0);
  const fits = cells.filter((k) => capacity(d, k, o) >= count).sort((a, b) => area(a) - area(b));
  return fits[0] ?? [...cells].sort((a, b) => area(b) - area(a))[0] ?? null;
}

/** The block a placed lot fills, laid out as it would go in its compartment (base-local, mm): its footprint and height. */
export function bundleSize(d: Design, c: Content): { w: number; d: number; h: number } {
  const s = sizeOf(c);
  const n = Math.max(1, c.count ?? 1);
  const cells = compartments(d, c.baseId);
  const cell = cells.find((k) => inCell(k, c));
  const W = cell ? cell.x1 - cell.x0 : s.w * n, D = cell ? cell.y1 - cell.y0 : s.d;
  // long side along the compartment's long side
  const turn = s.w > s.d ? W < D : W > D;
  const [ow, od] = turn ? [s.d, s.w] : [s.w, s.d];
  const across = Math.max(1, Math.min(n, Math.floor(W / ow + 1e-9) || 1));
  const rows = Math.max(1, Math.min(Math.ceil(n / across), Math.floor(D / od + 1e-9) || 1));
  const layers = Math.ceil(n / (across * rows));
  return { w: across * ow, d: rows * od, h: layers * s.h };
}
