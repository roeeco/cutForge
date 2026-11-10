// What goes inside (milestone 40): everyday objects as boxes (W × D × H mm),
// the compartments of a box (its clear inside split by its dividers), and
// whether an object fits a compartment with the material's clearance.
import type { Content, Design, P2 } from '../model/types';
import type { MsgKey } from '../i18n';
import { clearBox } from '../model/dividers';
import { matOf, tOf } from '../model/materials';
import { matDir, toWorld } from '../model/frame';
import { isRectSketch, panelEdges } from '../model/edges';
import { pointInPolygon } from '../geom/vec';

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
 * A box's compartments. A rectangular base: its clear inside cut by the
 * dividers standing across it (each running the whole way). Another outline:
 * one compartment, the largest rectangle centred in it (approximately).
 */
export function compartments(d: Design, baseId: string): Compartment[] {
  const base = d.panels[baseId];
  if (!base) return [];
  const h = insideHeight(d, baseId);
  const box = clearBox(d, baseId);
  if (!box || !isRectSketch(base)) {
    const pts = panelEdges(base).map((e) => e.a);
    const t = tOf(d, baseId);
    const cx = pts.reduce((s, q) => s + q.x, 0) / pts.length, cy = pts.reduce((s, q) => s + q.y, 0) / pts.length;
    // grow a centred rectangle (keeping the outline's proportions) while it stays a wall's thickness inside
    const inside = (k: number) => {
      const ring = pts.map((q) => ({ x: cx + (q.x - cx) * k, y: cy + (q.y - cy) * k }));
      return ring;
    };
    const W = Math.max(...pts.map((q) => q.x)) - Math.min(...pts.map((q) => q.x)), H = Math.max(...pts.map((q) => q.y)) - Math.min(...pts.map((q) => q.y));
    const ring = inside(Math.max(0, 1 - (2 * t) / Math.min(W, H)));
    let s = 0;
    for (let k = 0.5; k >= 0.005; k /= 2) if ([[-1, -1], [1, -1], [1, 1], [-1, 1]].every(([i, j]) => pointInPolygon({ x: cx + (i * (s + k) * W) / 2, y: cy + (j * (s + k) * H) / 2 }, ring))) s += k;
    return [{ baseId, x0: cx - (s * W) / 2, x1: cx + (s * W) / 2, y0: cy - (s * H) / 2, y1: cy + (s * H) / 2, h, poly: ring }];
  }
  const t = tOf(d, baseId);
  // divider slabs across the inside: x positions (standing from e3 or e1) and y positions (from e0 or e2)
  const xs: number[] = [], ys: number[] = [];
  for (const c of Object.values(d.connections)) {
    if (!c.grown || c.a.panelId !== baseId || Math.abs(c.angle - 90) > 1e-6 || c.dir !== 'up' || c.offset <= Math.max(t, 6) + 1e-6) continue;
    const dt = tOf(d, c.b.panelId);
    if (c.a.edge === 'e3') xs.push(c.offset);
    else if (c.a.edge === 'e1') xs.push(base.w - c.offset - dt);
    else if (c.a.edge === 'e0') ys.push(c.offset);
    else if (c.a.edge === 'e2') ys.push(base.h - c.offset - dt);
  }
  const cuts = (lo: number, hi: number, at: number[]) => {
    const out: [number, number][] = [];
    let a = lo;
    for (const x of [...at].sort((p, q) => p - q)) {
      if (x <= a || x >= hi) continue;
      out.push([a, x]);
      a = x + t;
    }
    out.push([a, hi]);
    return out.filter(([p, q]) => q - p > 0.5);
  };
  const out: Compartment[] = [];
  for (const [y0, y1] of cuts(box.y0, box.y1, ys)) for (const [x0, x1] of cuts(box.x0, box.x1, xs)) out.push({ baseId, x0, x1, y0, y1, h });
  return out;
}

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
  const cell = cells.find((k) => c.x >= k.x0 && c.x <= k.x1 && c.y >= k.y0 && c.y <= k.y1) ?? null;
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
  const cell = cells.find((k) => c.x >= k.x0 && c.x <= k.x1 && c.y >= k.y0 && c.y <= k.y1);
  const W = cell ? cell.x1 - cell.x0 : s.w * n, D = cell ? cell.y1 - cell.y0 : s.d;
  // long side along the compartment's long side
  const turn = s.w > s.d ? W < D : W > D;
  const [ow, od] = turn ? [s.d, s.w] : [s.w, s.d];
  const across = Math.max(1, Math.min(n, Math.floor(W / ow + 1e-9) || 1));
  const rows = Math.max(1, Math.min(Math.ceil(n / across), Math.floor(D / od + 1e-9) || 1));
  const layers = Math.ceil(n / (across * rows));
  return { w: across * ow, d: rows * od, h: layers * s.h };
}
