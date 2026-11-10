// Guardrails for Quick build (milestone 39): shapes are kept where the laser
// can cut them. The keep-out zones come from the same geometry the export
// check uses: the panel's outline (with its joint notches) inset by the
// material's minimum web, every slot and tab hole on the panel, and the other
// cut-outs. An edit that would put a shape there is pulled back along the
// change to the nearest allowed place; a new shape is shrunk about its centre.
import type { Design, Detail, P2, Panel } from '../model/types';
import { instancePolys, isOutlineShape } from '../model/outline';
import { detailCorners, detailInstances, panelExtras, panelNotches, panelOutline } from '../model/geometry';
import { pointInPolygon } from '../geom/vec';
import { minWeb, panelFit, shapeFit, webTo, type PanelFit } from '../model/validate';
import { matOf } from '../model/materials';
import { autoConnect, solve } from '../model/ops';

export type GuardWhy = 'edge' | 'joint' | 'shape' | 'text';
/** What the last guarded edit did, for the tooltip: the shape, why, and the web kept (mm). */
export type GuardNote = { detailId: string; why: GuardWhy; mm: number };

/** Engraved text this small stays readable; cut-out letters keep their bridges (mm, letter height). */
export function minTextSize(d: Design, panelId: string, op: Detail['op']): number {
  const t = matOf(d, panelId).thickness;
  return op === 'cut' ? Math.max(8, Math.ceil(3 * t)) : Math.max(4, Math.ceil(t));
}

type Ctx = { outline: P2[]; plain: P2[]; holes: P2[][]; others: P2[][]; min: number; fit: PanelFit; p: Panel };

export function panelCtx(d: Design, p: Panel, moving: Set<string>): Ctx {
  const notches = panelNotches(d, p);
  const ex = panelExtras(d, p);
  // the panel as it is without the shapes being placed (a shape across its edge would notch it)
  const rest: Panel = { ...p, details: p.details.filter((x) => !moving.has(x.id)) };
  const others: P2[][] = [];
  for (const dt of p.details) if (!moving.has(dt.id) && dt.op === 'cut' && !isOutlineShape(p, dt.id)) for (const ip of instancePolys(dt)) others.push(...ip.polys);
  return { outline: panelOutline(rest, notches), plain: panelOutline(rest, {}), holes: [...ex.holes, ...ex.cuts], others, min: minWeb(d, p.id), fit: panelFit(d, rest), p: rest };
}

/** Do two closed polygons overlap or come closer than `gap`? */
function tooClose(a: P2[], b: P2[], gap: number): boolean {
  if (a.some((q) => pointInPolygon(q, b)) || b.some((q) => pointInPolygon(q, a))) return true;
  return gap > 0 && webTo(a, b) < gap - 1e-9;
}

/** Where a shape breaks the rules (null: it may be cut there). */
export function trouble(ctx: Ctx, dt: Detail): GuardWhy | null {
  if (dt.op === 'score' || dt.op === 'add') return null;
  // text by its box (its letters lie inside it; much quicker than every glyph)
  const polys = dt.shape === 'text' ? detailInstances(dt).map((x) => detailCorners(x)) : instancePolys(dt).flatMap((ip) => ip.polys);
  if (!polys.length) return null;
  const cut = dt.op === 'cut';
  const web = cut ? ctx.min : 0.5;
  const inside = (ring: P2[]) => polys.every((poly) => poly.every((q) => pointInPolygon(q, ring)) && webTo(poly, ring) >= web - 1e-9);
  if (!inside(ctx.outline)) return inside(ctx.plain) ? 'joint' : 'edge';
  // the export check's own rule (a shape on a plain rectangle keeps the web from its deepest joint notch)
  if (shapeFit(ctx.fit, ctx.p, dt, false)) return 'joint';
  if (polys.some((poly) => ctx.holes.some((h) => tooClose(poly, h, web)))) return 'joint';
  if (cut && polys.some((poly) => ctx.others.some((o) => tooClose(poly, o, ctx.min)))) return 'shape';
  return null;
}

/** Is this shape where the laser can cut it (outside every keep-out zone)? */
export function shapeAllowed(d: Design, detailId: string): boolean {
  for (const id of d.order) {
    const p = d.panels[id];
    const dt = p?.details.find((x) => x.id === detailId);
    if (dt) return !trouble(panelCtx(d, p, new Set([dt.id])), dt);
  }
  return true;
}

const lerp = (a: number, b: number, s: number) => a + (b - a) * s;
function between(o: Detail, n: Detail, s: number): Detail {
  const r = { ...n, cx: lerp(o.cx, n.cx, s), cy: lerp(o.cy, n.cy, s), w: lerp(o.w, n.w, s), h: lerp(o.h, n.h, s) };
  if (o.rot !== undefined || n.rot !== undefined) r.rot = lerp(o.rot ?? 0, n.rot ?? 0, s);
  if (o.r !== undefined && n.r !== undefined) r.r = lerp(o.r, n.r, s);
  if (o.text && n.text) r.text = { ...n.text, size: lerp(o.text.size, n.text.size, s) };
  if (s < 1) r.array = o.array;
  return r;
}

/** The largest s in [0, 1] for which `ok(s)` holds, given ok(0). */
function farthest(ok: (s: number) => boolean): number {
  if (ok(1)) return 1;
  let lo = 0, hi = 1;
  for (let i = 0; i < 22; i++) {
    const m = (lo + hi) / 2;
    if (ok(m)) lo = m;
    else hi = m;
  }
  return lo;
}

const sameShape = (a: Detail, b: Detail) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Keep the shapes an edit changed out of the keep-out zones (Quick build):
 * `base` is the design before the edit, `d` after it (changed in place).
 * Shapes on a panel whose size or outline changed are left for the fixes.
 * Returns what was kept, for the tooltip, or null.
 */
export function guardEdit(base: Design, d: Design): GuardNote | null {
  let note: GuardNote | null = null;
  for (const id of d.order) {
    const p = d.panels[id], bp = base.panels[id];
    if (!p) continue;
    if (bp && (bp.w !== p.w || bp.h !== p.h || JSON.stringify(bp.sketch) !== JSON.stringify(p.sketch))) continue;
    const old = new Map((bp?.details ?? []).map((x) => [x.id, x]));
    const changed = p.details.filter((dt) => !old.has(dt.id) || !sameShape(old.get(dt.id)!, dt));
    if (!changed.length) continue;
    // text keeps a readable size
    for (const dt of changed)
      if (dt.shape === 'text' && dt.text) {
        const m = minTextSize(d, id, dt.op);
        if (dt.text.size < m - 1e-9) {
          const k = m / dt.text.size;
          dt.text = { ...dt.text, size: m };
          dt.w *= k;
          dt.h *= k;
          note = { detailId: dt.id, why: 'text', mm: m };
        }
      }
    const ctx = panelCtx(d, p, new Set(changed.map((x) => x.id)));
    const troubled = changed.filter((dt) => trouble(ctx, dt));
    if (!troubled.length) continue;
    // shapes that moved or changed: one common step back along the change, so a group keeps its formation
    const was = changed.filter((dt) => old.has(dt.id) && !trouble(ctx, old.get(dt.id)!));
    if (was.length) {
      const target = new Map(changed.map((dt) => [dt.id, { ...dt }]));
      const s = farthest((k) => was.every((dt) => !trouble(ctx, between(old.get(dt.id)!, target.get(dt.id)!, k))));
      for (const dt of changed) {
        const o = old.get(dt.id);
        if (!o) continue;
        Object.assign(dt, between(o, target.get(dt.id)!, s));
      }
      note = { detailId: troubled[0].id, why: trouble(ctx, target.get(troubled[0].id)!) ?? 'edge', mm: ctx.min };
    }
    // new shapes: shrunk about their centre until they fit; one that fits nowhere there (or text) is not made
    for (const dt of [...changed]) {
      if (old.has(dt.id)) continue;
      const why = trouble(ctx, dt);
      if (!why) continue;
      const full = { ...dt };
      const tiny = { ...dt, w: Math.min(dt.w, 1), h: Math.min(dt.h, 1), ...(dt.r !== undefined ? { r: 0 } : {}) };
      // text (placed with a click) moves to the nearest place it fits
      if (dt.shape === 'text' && fitShape(d, dt.id)) {
        note = { detailId: dt.id, why, mm: ctx.min };
        continue;
      }
      if (dt.shape === 'text' || trouble(ctx, tiny)) {
        p.details.splice(p.details.indexOf(dt), 1);
        note = { detailId: dt.id, why, mm: ctx.min };
        continue;
      }
      const s = farthest((k) => !trouble(ctx, between(tiny, full, k)));
      Object.assign(dt, between(tiny, full, s));
      note = { detailId: dt.id, why, mm: ctx.min };
    }
  }
  return note;
}

/**
 * An edit as Quick build makes it (`d` already edited from `base`): the guard
 * on the geometry the edit started from, then solve and join, then the guard
 * once more (joints may move around the shapes' new places).
 */
export function quickGuard(base: Design, d: Design): GuardNote | null {
  const a = guardEdit(base, d);
  solve(d);
  autoConnect(d);
  const b = guardEdit(base, d);
  if (b) solve(d);
  return b ?? a;
}

/** The allowed area's border on a panel (the outline inset by the web) and the zones around its slots, for the faint hatch. */
export function keepOutZones(d: Design, panelId: string): { inset: P2[]; holes: P2[][]; min: number } | null {
  const p = d.panels[panelId];
  if (!p) return null;
  const ctx = panelCtx(d, p, new Set());
  return { inset: insetPolygon(ctx.outline, ctx.min), holes: ctx.holes, min: ctx.min };
}

/** A simple polygon offset inwards by `k` (mitred; good enough to draw). */
function insetPolygon(pts: P2[], k: number): P2[] {
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) area += pts[i].x * pts[(i + 1) % n].y - pts[(i + 1) % n].x * pts[i].y;
  const sgn = area >= 0 ? 1 : -1;
  const out: P2[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
    const n1 = norm({ x: -(b.y - a.y) * sgn, y: (b.x - a.x) * sgn }), n2 = norm({ x: -(c.y - b.y) * sgn, y: (c.x - b.x) * sgn });
    const m = norm({ x: n1.x + n2.x, y: n1.y + n2.y });
    const cos = Math.max(0.3, m.x * n1.x + m.y * n1.y);
    out.push({ x: b.x + (m.x * k) / cos, y: b.y + (m.y * k) / cos });
  }
  return out;
}
const norm = (v: P2): P2 => {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
};

/**
 * Put a shape where it may be cut (a one-click fix): the nearest allowed
 * place on its panel, or, when it fits nowhere, smaller at the nearest place.
 * False when even that fails.
 */
export function fitShape(d: Design, detailId: string): boolean {
  for (const id of d.order) {
    const p = d.panels[id];
    const dt = p?.details.find((x) => x.id === detailId);
    if (!dt) continue;
    const ctx = panelCtx(d, p, new Set([dt.id]));
    if (!trouble(ctx, dt)) return true;
    const step = Math.max(1, Math.min(p.w, p.h) / 40);
    // the grid's points, nearest first: the first allowed one is the nearest place
    const pts: { x: number; y: number; dist: number }[] = [];
    for (let x = step / 2; x < p.w; x += step) for (let y = step / 2; y < p.h; y += step) pts.push({ x, y, dist: Math.hypot(x - dt.cx, y - dt.cy) });
    pts.sort((a, b) => a.dist - b.dist);
    for (const k of [1, 0.8, 0.6, 0.45, 0.3, 0.2]) {
      const trial = { ...dt, w: dt.w * k, h: dt.h * k, ...(dt.text ? { text: { ...dt.text, size: dt.text.size * k } } : {}) };
      const best = pts.find((q) => !trouble(ctx, { ...trial, cx: q.x, cy: q.y }));
      if (best) {
        Object.assign(dt, trial, { cx: Math.round(best.x * 10) / 10, cy: Math.round(best.y * 10) / 10 });
        if (trouble(ctx, dt)) Object.assign(dt, { cx: best.x, cy: best.y });
        return true;
      }
    }
    return false;
  }
  return false;
}
