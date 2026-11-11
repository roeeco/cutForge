// Quick build's five actions as recipes over the existing ops (milestone 38).
// Each one is what doing the same steps in Workshop makes; the stage runs it
// as one preview transaction confirmed with ✓ (one undo step).
import type { Design, DetailOp, DetailShape, DividerRec, P2, V3 } from '../model/types';
import { addDetail, addDividerRec, addPathShape, addPolygonPanel, addRootPanel, addText, addTray, dividerFromLine, DIVIDER_GAP, MIN_PANEL, parentConnection, regularPolygon } from '../model/ops';
import { planDividerRec, rowAt, rowGaps, type DividerSpan, type DividerWhy } from '../model/dividers';
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


const dot = (a: P2, b: P2) => a.x * b.x + a.y * b.y;
const sub = (a: P2, b: P2): P2 => ({ x: a.x - b.x, y: a.y - b.y });



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
  | { kind: 'divider'; a: P2; b: P2; rec: DividerRec; span: DividerSpan; height: number; gaps: [number, number] | null }
  | { kind: 'refused'; a: P2; b: P2; why: DividerWhy };

/**
 * What a line drawn on a base (base-local, on its top face) makes (milestone
 * 44): always a divider along it, whose ends run to the boards beyond where it
 * reached, crossing the dividers it passes; or, when none can stand there, the
 * reason. Null while the line is too short to say.
 */
export function planDividerLine(d: Design, baseId: string, a: P2, b: P2, fallbackHeight = 40): DividerLinePlan | null {
  const base = d.panels[baseId];
  if (!base || Math.hypot(b.x - a.x, b.y - a.y) < MIN_PANEL) return null;
  const rec = dividerFromLine(a, b);
  const t = tOf(d, baseId);
  const plan = planDividerRec(d, baseId, rec, t);
  if (!plan.ok) return { kind: 'refused', a, b, why: plan.why };
  const row = rowAt(d, baseId, rec.at, rec.rot, t);
  // as tall as the walls allow; what the ghost shows is what ✓ makes (BUGFIX_PLAN B19)
  const height = Math.max(MIN_PANEL, dividerHeight(d, baseId) ?? fallbackHeight);
  return { kind: 'divider', a, b, rec, span: plan.span, height, gaps: row ? rowGaps(row) : null };
}

/** Make what `planDividerLine` describes: the divider (null when it is refused). */
export function dividerLine(d: Design, baseId: string, a: P2, b: P2, fallbackHeight = 40): { kind: 'divider'; id: string } | null {
  const plan = planDividerLine(d, baseId, a, b, fallbackHeight);
  if (plan?.kind !== 'divider') return null;
  const id = addDividerRec(d, baseId, plan.rec, plan.height);
  return id ? { kind: 'divider', id } : null;
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
