// Quick build's five actions as recipes over the existing ops (milestone 38).
import { bestReach } from '../model/bendPatterns';
import { defaultEnd, defaultSeam, MIN_END } from '../model/round';
// Each one is what doing the same steps in Workshop makes; the stage runs it
// as one preview transaction confirmed with ✓ (one undo step).
import type { Design, DetailOp, DetailShape, DividerRec, MaterialProfile, P2, SketchPt, V3 } from '../model/types';
import { addRoundPanel, addRoundedRect, addDetail, addDividerRec, addPathShape, addPlacedPanel, addPolygonPanel, addRootPanel, addText, addTray, autoConnect, createDesign, setRoundMinOf, dividerFromLine, DIVIDER_GAP, MIN_PANEL, normalizeSketch, parentConnection, regularPolygon, solve, type FacePick } from '../model/ops';
import { validate } from '../model/validate';
import { planDividerRec, rowAt, rowGaps, type DividerSpan, type DividerWhy } from '../model/dividers';
import { matDir, toLocal, toWorld } from '../model/frame';
import { foldsAsCarton, tOf } from '../model/materials';
import { effectiveGrow, growWith } from '../views/ghost';
import { heightTargets } from '../model/adapt';
import { boxLid, setBoxLid, wallClosesBox } from './lid';
import type { BoxKind } from '../store/store';

/** The first box rises this high (mm); later boxes at the last height used. */
export const BOX_HEIGHT = 45;

/** A box's footprint on the floor (floor coordinates: x along world X, z along world Z). */
export type Footprint =
  | { kind: 'rect'; x0: number; z0: number; x1: number; z1: number }
  | { kind: 'regular'; x0: number; z0: number; x1: number; z1: number; sides: number }
  /** milestone 64: a rectangle with its corners rounded to `r` (at least what its walls bend to) */
  | { kind: 'rounded'; x0: number; z0: number; x1: number; z1: number; r: number; height?: number }
  /** milestone 65: a circle (a drag about as wide as deep) or an oval, no tighter than its walls bend */
  | { kind: 'round'; x0: number; z0: number; x1: number; z1: number; height?: number }
  /**
   * milestone 180 (BOXES_PLYWOOD_PLAN.md E7): any polygon, convex or with inside corners, from its points (floor
   * coordinates: x along world X, y along world −Z); a point with `curve: 'round'` is a corner rounded to `r`, at least
   * what its walls bend round (milestone 181, E8). Its walls meet at inside corners as corners seen from inside,
   * fingered on plywood (`Tray.insideCorners`).
   */
  | { kind: 'outline'; pts: SketchPt[]; height?: number };

/**
 * The smallest corner radius a box's walls can bend round in this material
 * (milestone 64): the tightest its bend patterns reach on a 40 mm wall, plus
 * the wall's thickness (the base's corner is the band's outer face).
 */
export function roundedMin(m: MaterialProfile, height = 40): number {
  // one rule with the export check (milestone 138, REPORT.md I1/I11: the card asked 21.5 mm where the check passed
  // 18.8 mm, and the other way round on low plywood walls): the least radius a box of this height in this board
  // passes the check at, found on a probe box (a few milliseconds a try), to the half millimetre, kept per board
  const h = Math.max(5, Math.round(height));
  const key = JSON.stringify([m.kind, m.thickness, m.clearance, m.bend ?? null, h]);
  const hit = minCache.get(key);
  if (hit !== undefined) return hit;
  const est = estimateMin(m, h);
  const bad = (r: number) => {
    const d = createDesign(m);
    const W = Math.max(200, 4 * r + 60), D = Math.max(120, 3 * r + 60);
    const b = addRoundedRect(d, 0, D, W, D, r);
    if (!b) return true;
    addTray(d, b, h);
    autoConnect(d);
    return validate(d).some((i) => i.key === 'val.bendTight' || i.key === 'val.bendRoom' || i.key === 'val.bendShort');
  };
  let r = est;
  try {
    let hi = Math.max(est, m.thickness * 2, 1);
    for (let i = 0; i < 6 && bad(hi); i++) hi *= 1.5;
    if (!bad(hi)) {
      let lo = m.thickness / 2;
      if (!bad(lo)) hi = lo;
      else
        for (let i = 0; i < 10; i++) {
          const mid = (lo + hi) / 2;
          if (bad(mid)) lo = mid;
          else hi = mid;
        }
      r = Math.ceil(hi * 2) / 2;
    }
  } catch {
    r = est;
  }
  if (minCache.size > 200) minCache.clear();
  minCache.set(key, r);
  return r;
}
const minCache = new Map<string, number>();
// the model's material change grows rounded corners to this (ops.ts, `toNewBoard`)
setRoundMinOf(roundedMin);

/** The estimate the probe starts from: the tightest its bend patterns reach on a wall this high, plus the thickness. */
function estimateMin(m: MaterialProfile, height: number): number {
  // its walls are about the box's height (less the base's thickness where they stand on it)
  const reach = Math.max(...[height, height - m.thickness].map((len) => bestReach({ m, r: 0, len, width: 50, turn: Math.PI / 2 })));
  return Math.ceil(((Number.isFinite(reach) ? reach : 0) + m.thickness) * 2) / 2;
}

/** The base a footprint makes (the same as drawing it with the Panel or Polygon tool); null when too small. */
export function addBoxBase(d: Design, f: Footprint): string | null {
  if (f.kind === 'outline') return addOutlineBase(d, f.pts, f.height);
  const x0 = Math.min(f.x0, f.x1), x1 = Math.max(f.x0, f.x1), z0 = Math.min(f.z0, f.z1), z1 = Math.max(f.z0, f.z1);
  if (x1 - x0 < MIN_PANEL || z1 - z0 < MIN_PANEL) return null;
  if (f.kind === 'rect') return addRootPanel(d, x0, z1, x1 - x0, z1 - z0);
  if (f.kind === 'rounded') return addRoundedRect(d, x0, z1, x1 - x0, z1 - z0, Math.max(f.r, roundedMin(d.material, f.height)));
  if (f.kind === 'round') return addRoundBox(d, x0, z0, x1, z1, roundedMin(d.material, f.height));
  // a regular polygon inside the dragged square, centred on it
  const r = Math.min(x1 - x0, z1 - z0) / 2;
  return addPolygonPanel(d, (x0 + x1) / 2, (z0 + z1) / 2, regularPolygon(f.sides, r));
}

/**
 * A base from an outline's points (milestone 180): the polygon (refused when it crosses itself), its rounded corners
 * kept, each no tighter than its walls bend round on a wall `height` tall (milestone 181).
 */
export function addOutlineBase(d: Design, pts: SketchPt[], height?: number): string | null {
  const minX = Math.min(...pts.map((q) => q.x)), minY = Math.min(...pts.map((q) => q.y));
  const id = addPolygonPanel(d, minX, -minY, pts.map((q) => ({ x: q.x - minX, y: q.y - minY })));
  if (!id) return null;
  const s = d.panels[id].sketch;
  if (s.kind !== 'poly' || !pts.some((q) => q.curve === 'round')) return id;
  // the corners again by where they are (the polygon may have been turned round to run anticlockwise)
  const min = roundedMin(d.material, height);
  for (const q of s.pts) {
    const src = pts.find((z) => Math.abs(z.x - minX - q.x) < 1e-6 && Math.abs(z.y - minY - q.y) < 1e-6);
    if (src?.curve !== 'round') continue;
    q.curve = 'round';
    q.r = Math.max(MIN_END, src.r ?? 0, min);
  }
  normalizeSketch(d.panels[id]);
  solve(d);
  return id;
}

/**
 * A round base for Quick build's Round box (milestone 65): a circle when the
 * drag is about as wide as deep (within a tenth), else an oval with the
 * draftsman's ends. Its curves are no tighter than `min` (what its walls bend
 * round): a circle at least twice that across, an oval's ends at least that
 * round (a stadium when its depth allows no more), grown about its centre.
 */
export function addRoundBox(d: Design, x0: number, z0: number, x1: number, z1: number, min: number): string | null {
  let w = x1 - x0, h = z1 - z0;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const circle = Math.abs(w - h) <= 0.1 * Math.max(w, h);
  if (circle) w = h = Math.max(w, h, 2 * min);
  else {
    // an oval's ends at least `min` round: its short side at least twice that
    if (Math.min(w, h) < 2 * min) (w < h ? (w = 2 * min) : (h = 2 * min));
  }
  const rEnd = circle ? undefined : Math.min(Math.min(w, h) / 2, Math.max(defaultEnd(w, h), min));
  // with its seam flat from the start, so the walls rising as a ghost stand on it
  const seam = defaultSeam(d.material.kind);
  return addRoundPanel(d, cx - w / 2, cz + h / 2, w, h, circle ? { shape: 'circle', seam } : { shape: 'oval', rEnd, seam });
}

/**
 * The walls of a Box of this kind on its base (milestone 73): an open box; a
 * box with its automatic lid (the cap until milestone 74); or a carton, a tube
 * with a tuck top and a bottom that snaps shut. Returns the tray.
 */
export function boxTray(d: Design, baseId: string, height: number, kind: BoxKind = 'open', insideCorners?: 'finger'): string | null {
  const tray = addTray(d, baseId, height, kind === 'carton' ? { base: 'open', bottom: 'snap', top: 'tuck' } : insideCorners ? { insideCorners } : undefined);
  if (tray && kind === 'lid') setBoxLid(d, tray, 'liftoff');
  return tray;
}

/** Box: a base from the footprint and a tray of walls at `height`, with the design's tray joints, of the kind chosen. */
export function boxRecipe(d: Design, f: Footprint, height: number, kind: BoxKind = 'open'): { baseId: string } | null {
  const baseId = addBoxBase(d, f);
  if (!baseId) return null;
  // a carton needs a board that folds (milestone 116: card up to 1 mm, corrugated up to 4 as before) and a rectangle
  boxTray(d, baseId, height, kind === 'carton' && (!foldsAsCarton(d.material, 4) || f.kind !== 'rect') ? 'open' : kind, f.kind === 'outline' ? 'finger' : undefined);
  return { baseId };
}

/** Wall / lid: grown at 90° on the whole edge, fitted to its neighbours, with the design's joint (Workshop's grow card with its defaults). */
export function wallRecipe(d: Design, panelId: string, edge: string, height: number): string | null {
  return growWith(d, panelId, edge, { height, angle: 90, adapt: true, span: null, sketch: null })?.panelId ?? null;
}

/**
 * Quick build's Wall / lid as its ✓ makes it (milestone 73): a ghost that
 * closes a box makes the box's lid (`setBoxLid`); any other is a wall.
 * Returns the board made (a lid's top), or null.
 */
export function quickWallRecipe(d: Design, panelId: string, edge: string, height: number): string | null {
  const g = effectiveGrow(d, panelId, edge, { height, angle: 90, adapt: true, span: null, sketch: null });
  const closes = wallClosesBox(d, panelId, edge, g.ghost);
  if (!closes) return wallRecipe(d, panelId, edge, height);
  setBoxLid(d, closes.tray, closes.choice);
  const lid = boxLid(d, closes.tray);
  return lid.kind === 'liftoff' ? lid.top : lid.kind === 'hinged' ? lid.lid : null;
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
