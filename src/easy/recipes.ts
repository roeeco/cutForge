// Quick build's five actions as recipes over the existing ops (milestone 38).
// Each one is what doing the same steps in Workshop makes; the stage runs it
// as one preview transaction confirmed with ✓ (one undo step).
import type { Design, DetailOp, DetailShape, P2, V3 } from '../model/types';
import { addDetail, addDividerBetween, addPathShape, addPlacedPanel, addPolygonPanel, addRootPanel, addText, addTray, DIVIDER_GAP, MIN_PANEL, parentConnection, planDividerBetween, regularPolygon, type BetweenPlan, type FacePick } from '../model/ops';
import { matDir, toLocal, toWorld } from '../model/frame';
import { tOf } from '../model/materials';
import { effectiveGrow, growWith } from '../views/ghost';
import { heightTargets } from '../model/adapt';

/** The first box rises this high (mm); later boxes at the last height used. */
export const BOX_HEIGHT = 45;

/** A box's footprint on the floor (floor coordinates: x along world X, z along world Z). */
export type Footprint = { kind: 'rect'; x0: number; z0: number; x1: number; z1: number } | { kind: 'regular'; x0: number; z0: number; x1: number; z1: number; sides: number };

/** The base a footprint makes (the same as drawing it with the Panel or Polygon tool); null when too small. */
export function addBoxBase(d: Design, f: Footprint): string | null {
  const x0 = Math.min(f.x0, f.x1), x1 = Math.max(f.x0, f.x1), z0 = Math.min(f.z0, f.z1), z1 = Math.max(f.z0, f.z1);
  if (x1 - x0 < MIN_PANEL || z1 - z0 < MIN_PANEL) return null;
  if (f.kind === 'rect') return addRootPanel(d, x0, z1, x1 - x0, z1 - z0);
  // a regular polygon inside the dragged square, centred on it
  const r = Math.min(x1 - x0, z1 - z0) / 2;
  return addPolygonPanel(d, (x0 + x1) / 2, (z0 + z1) / 2, regularPolygon(f.sides, r));
}

/** Box: a base from the footprint and a tray of walls at `height`, with the design's tray joints. */
export function boxRecipe(d: Design, f: Footprint, height: number): { baseId: string } | null {
  const baseId = addBoxBase(d, f);
  if (!baseId) return null;
  addTray(d, baseId, height);
  return { baseId };
}

/** Wall / lid: grown at 90° on the whole edge, fitted to its neighbours, with the design's joint (Workshop's grow card with its defaults). */
export function wallRecipe(d: Design, panelId: string, edge: string, height: number): string | null {
  return growWith(d, panelId, edge, { height, angle: 90, adapt: true, span: null, sketch: null })?.panelId ?? null;
}

/** Hole: a circle, rectangle or rounded rectangle, cut out (or engraved). */
export function holeRecipe(d: Design, panelId: string, shape: Extract<DetailShape, 'circle' | 'rect' | 'roundrect'>, cx: number, cy: number, w: number, h: number, op: DetailOp = 'cut'): string | null {
  return addDetail(d, panelId, shape, op, cx, cy, w, h);
}

/** Text, engraved by default. */
export function textRecipe(d: Design, panelId: string, cx: number, cy: number, value: string, op: DetailOp = 'engrave'): string | null {
  return addText(d, panelId, cx, cy, value, op);
}

/** A sticker (polylines in a unit box), engraved by default. */
export function stickerRecipe(d: Design, panelId: string, polys: P2[][], cx: number, cy: number, size: number, op: DetailOp = 'engrave'): string | null {
  return addPathShape(d, panelId, polys, cx, cy, size, size, op);
}

// ---------- Divider: a line drawn inside a box ----------

/** Distance (mm) within which a divider line's end snaps to a wall's inner face. */
export const DIVIDER_SNAP = 15;

/** A face of a panel standing on a base, in the base's coordinates: from p0 to p1, facing n. */
type StandFace = { panelId: string; side: 1 | -1; p0: P2; p1: P2; n: P2 };

/** The panels standing square on a base's top face: walls and dividers grown from it, panels placed standing on it. */
export function standingOn(d: Design, baseId: string): string[] {
  const out: string[] = [];
  for (const c of Object.values(d.connections)) if (c.grown && c.a.panelId === baseId && Math.abs(c.angle - 90) < 1e-6 && c.dir === 'up' && d.panels[c.b.panelId]) out.push(c.b.panelId);
  for (const p of Object.values(d.panels)) if (p.place?.host === baseId && p.place.face === 1 && p.place.pose === 'standing') out.push(p.id);
  return out;
}

function standFaces(d: Design, baseId: string): StandFace[] {
  const base = d.panels[baseId];
  const u = base.frame.u, v = base.frame.v;
  const faces: StandFace[] = [];
  for (const id of standingOn(d, baseId)) {
    const p = d.panels[id];
    const m = matDir(p.frame), t = tOf(d, id);
    for (const side of [1, -1] as const) {
      const z = side === 1 ? t : 0;
      const p0 = toLocal(base.frame, toWorld(p.frame, 0, 0, z)), p1 = toLocal(base.frame, toWorld(p.frame, p.w, 0, z));
      const n = { x: (m[0] * u[0] + m[1] * u[1] + m[2] * u[2]) * side, y: (m[0] * v[0] + m[1] * v[1] + m[2] * v[2]) * side };
      const l = Math.hypot(n.x, n.y);
      if (l < 0.9) continue;
      faces.push({ panelId: id, side, p0: { x: p0.x, y: p0.y }, p1: { x: p1.x, y: p1.y }, n: { x: n.x / l, y: n.y / l } });
    }
  }
  return faces;
}

const dot = (a: P2, b: P2) => a.x * b.x + a.y * b.y;
const sub = (a: P2, b: P2): P2 => ({ x: a.x - b.x, y: a.y - b.y });

/** Where the ray from `from` through `to` meets a face facing back at it, near `to` (within DIVIDER_SNAP). */
function snapEnd(faces: StandFace[], from: P2, to: P2): { face: StandFace; at: P2 } | null {
  const L = Math.hypot(to.x - from.x, to.y - from.y);
  if (L < 1e-6) return null;
  const dir = { x: (to.x - from.x) / L, y: (to.y - from.y) / L };
  let best: { face: StandFace; at: P2; err: number } | null = null;
  for (const f of faces) {
    const dn = dot(dir, f.n);
    if (dn > -0.5) continue;
    const s = dot(sub(f.p0, from), f.n) / dn;
    if (s <= 1e-6) continue;
    const at = { x: from.x + dir.x * s, y: from.y + dir.y * s };
    const seg = sub(f.p1, f.p0), sl = Math.hypot(seg.x, seg.y);
    const k = dot(sub(at, f.p0), seg) / (sl || 1);
    if (k < -1 || k > sl + 1) continue;
    const err = Math.abs(s - L);
    if (err <= DIVIDER_SNAP && (!best || err < best.err)) best = { face: f, at, err };
  }
  return best ? { face: best.face, at: best.at } : null;
}

/** The point of a face nearest `q` (base-local), as a world point just above the base's top face. */
function onFace(d: Design, baseId: string, f: StandFace, q: P2): V3 {
  const k = dot(sub(q, f.p0), f.n);
  const at = { x: q.x - f.n.x * k, y: q.y - f.n.y * k };
  return toWorld(d.panels[baseId].frame, at.x, at.y, tOf(d, baseId) + 1);
}

/** The tallest a divider may stand on the base: the lowest wall's top, less the gap (null without walls). */
function dividerHeight(d: Design, baseId: string): number | null {
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
  return Number.isFinite(low) ? Math.round(low - t - DIVIDER_GAP) : null;
}

export type DividerLinePlan =
  | { kind: 'divider'; a: P2; b: P2; picks: [FacePick, FacePick]; plan: Extract<BetweenPlan, { ok: true }>; gaps: [number, number] | null }
  | { kind: 'standing'; a: P2; b: P2; height: number };

/**
 * What a line drawn on a base (base-local, on its top face) makes: from wall
 * to wall across facing, parallel walls, a divider (`addDividerBetween` at the
 * line's position, its ends snapped to the walls' inner faces); otherwise a
 * panel placed standing on the base along the line. Null when too short.
 */
export function planDividerLine(d: Design, baseId: string, a: P2, b: P2, fallbackHeight = 40): DividerLinePlan | null {
  const base = d.panels[baseId];
  if (!base) return null;
  const faces = standFaces(d, baseId);
  const ea = snapEnd(faces, b, a), eb = snapEnd(faces, a, b);
  const A = ea?.at ?? a, B = eb?.at ?? b;
  if (Math.hypot(B.x - A.x, B.y - A.y) < MIN_PANEL) return null;
  if (ea && eb && ea.face.panelId !== eb.face.panelId) {
    // the divider stands at the line's middle (along the walls)
    const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
    const picks: [FacePick, FacePick] = [
      { panelId: ea.face.panelId, side: ea.face.side, point: onFace(d, baseId, ea.face, mid) },
      { panelId: eb.face.panelId, side: eb.face.side, point: onFace(d, baseId, eb.face, mid) },
    ];
    const plan = planDividerBetween(d, picks[0], picks[1]);
    if (plan.ok && plan.baseId === baseId) return { kind: 'divider', a: A, b: B, picks, plan, gaps: compartmentGaps(faces, A, B, tOf(d, baseId), [ea.face.panelId, eb.face.panelId]) };
  }
  return { kind: 'standing', a: A, b: B, height: dividerHeight(d, baseId) ?? Math.max(MIN_PANEL, fallbackHeight) };
}

/** The clear sizes on either side of a divider along the line A→B: to the nearest parallel faces it runs between. */
function compartmentGaps(faces: StandFace[], A: P2, B: P2, t: number, ends: string[]): [number, number] | null {
  const L = Math.hypot(B.x - A.x, B.y - A.y);
  if (L < 1e-6) return null;
  const dir = { x: (B.x - A.x) / L, y: (B.y - A.y) / L }, nd = { x: -dir.y, y: dir.x };
  const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  let lo = Infinity, hi = Infinity;
  for (const f of faces) {
    if (ends.includes(f.panelId) || Math.abs(dot(f.n, nd)) < 0.99) continue;
    // the face must span the divider's middle along its length
    const s0 = dot(sub(f.p0, mid), dir), s1 = dot(sub(f.p1, mid), dir);
    if (Math.min(s0, s1) > 1 || Math.max(s0, s1) < -1) continue;
    const off = dot(sub(f.p0, mid), nd);
    // a face looking back at the divider bounds its compartment
    if (off > 0 && dot(f.n, nd) < 0) hi = Math.min(hi, off - t / 2);
    if (off < 0 && dot(f.n, nd) > 0) lo = Math.min(lo, -off - t / 2);
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  // in the base's own order: the compartment nearer its x (or y) = 0 first
  const g: [number, number] = [Math.round(lo * 10) / 10, Math.round(hi * 10) / 10];
  return nd.x + nd.y < 0 ? [g[1], g[0]] : g;
}

/** Make what `planDividerLine` describes: the divider or the standing panel. */
export function dividerLine(d: Design, baseId: string, a: P2, b: P2, fallbackHeight = 40): { kind: 'divider' | 'standing'; id: string } | null {
  const plan = planDividerLine(d, baseId, a, b, fallbackHeight);
  if (!plan) return null;
  if (plan.kind === 'divider') {
    const id = addDividerBetween(d, plan.picks[0], plan.picks[1]);
    return id ? { kind: 'divider', id } : null;
  }
  const rot = (Math.atan2(plan.b.y - plan.a.y, plan.b.x - plan.a.x) * 180) / Math.PI;
  const id = addPlacedPanel(d, { host: baseId, face: 1, x: plan.a.x, y: plan.a.y, rot, pose: 'standing', side: 1 }, Math.hypot(plan.b.x - plan.a.x, plan.b.y - plan.a.y), plan.height);
  return id ? { kind: 'standing', id } : null;
}

/** Is this panel a base a divider line can be drawn on (something stands on it)? */
export function isBoxBase(d: Design, panelId: string): boolean {
  return !!d.panels[panelId] && !parentConnection(d, panelId) && standingOn(d, panelId).length > 0;
}

/**
 * The height a Wall / lid starts at in Quick build: across to the far face of
 * the first panel it would reach (a lid snaps onto the opposite wall), else
 * as tall as the walls beside it, else `fallback`.
 */
export function quickWallHeight(d: Design, panelId: string, edge: string, fallback: number): number {
  const eg = effectiveGrow(d, panelId, edge, { height: 2000, angle: 90, adapt: false, span: null, sketch: null });
  const g = eg.plain;
  if (!g) return fallback;
  const v = g.frame.v, o = g.frame.o;
  let best: { near: number; far: number } | null = null;
  for (const id of d.order) {
    const p = d.panels[id];
    if (!p || id === panelId) continue;
    const mp = matDir(p.frame);
    const k = v[0] * mp[0] + v[1] * mp[1] + v[2] * mp[2];
    if (Math.abs(k) < 0.5) continue;
    const ys: number[] = [];
    for (const z of [0, tOf(d, id)]) {
      const d0 = (o[0] - p.frame.o[0]) * mp[0] + (o[1] - p.frame.o[1]) * mp[1] + (o[2] - p.frame.o[2]) * mp[2] - z;
      const y = -d0 / k;
      const at = toLocal(p.frame, toWorld(g.frame, g.w / 2, y));
      if (y > 1 && at.x >= -1e-6 && at.x <= p.w + 1e-6 && at.y >= -1e-6 && at.y <= p.h + 1e-6) ys.push(y);
    }
    if (ys.length === 2 && (!best || Math.min(...ys) < best.near)) best = { near: Math.min(...ys), far: Math.max(...ys) };
  }
  if (best) return Math.round(best.far * 10) / 10;
  const beside = heightTargets(d, g, new Set([panelId])).filter((y) => y < 1000);
  return beside.length ? Math.round(Math.max(...beside) * 10) / 10 : fallback;
}
