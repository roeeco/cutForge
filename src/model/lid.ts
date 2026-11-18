// Telescoping lids (milestone 71, PACKAGING_PLAN.md §6.3; from the parked branch's milestone 46). A lid can't grow off
// a curved top edge (a curved crease can't fold with one side flat), so a lid
// for a box is a shallow tray of the box's outline, grown outward by the wall
// thickness and the fit clearance, turned over and resting on the box: a hat
// box lid. It is a tray like any other (`Tray.lidOf` names the box's tray);
// its base's outline and place follow the box on every solve.
import type { Design, Panel, RoundShape, SketchPt, Tray, V3 } from './types';
import { toWorld } from './frame';
import { matDir } from './frame';
import { matOf, tOf } from './materials';
import { roundPts } from './round';

/** A new lid's rim (mm, its outer height less its top). */
export const LID_RIM = 12;

/** How far a lid's outline stands out from its box's: the box wall's thickness and the fit clearance. */
export function lidGap(d: Design, box: Tray): number {
  const m = matOf(d, box.baseId);
  return m.thickness + m.clearance;
}

/** A polygon outline grown outward by g: each straight edge moved out by g, rounded corners' radii grown by g (an offset of an arc is an arc). */
export function grownPts(pts: SketchPt[], g: number): SketchPt[] {
  const n = pts.length;
  let area = 0;
  for (let i = 0; i < n; i++) area += pts[i].x * pts[(i + 1) % n].y - pts[(i + 1) % n].x * pts[i].y;
  const s = area >= 0 ? 1 : -1;
  return pts.map((V, i) => {
    const P = pts[(i + n - 1) % n], N = pts[(i + 1) % n];
    // outward normals of the edges in and out (right of a CCW edge)
    const n1 = norm({ x: (V.y - P.y) * s, y: -(V.x - P.x) * s }), n2 = norm({ x: (N.y - V.y) * s, y: -(N.x - V.x) * s });
    const bx = n1.x + n2.x, by = n1.y + n2.y;
    const k = (bx * n1.x + by * n1.y) || 1;
    const q: SketchPt = { x: V.x + (g * bx) / k, y: V.y + (g * by) / k };
    if (V.curve) q.curve = V.curve;
    if (V.curve === 'round' && V.r) q.r = V.r + g;
    return q;
  });
}
const norm = (v: { x: number; y: number }) => {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
};

/** How far a lid of its own stands clear of its box (mm, milestone 76), and the step it moves by to find a free spot. */
export const LID_CLEAR = 20, LID_STEP = 10;

/** The bounds of a base's outline in its own coordinates (its points bound it, rounded corners included). */
function outlineBox(P: Panel): { x0: number; y0: number; x1: number; y1: number } {
  const pts = P.sketch.kind === 'poly' ? P.sketch.pts : [{ x: 0, y: 0 }, { x: P.w, y: P.h }];
  return { x0: Math.min(...pts.map((q) => q.x)), y0: Math.min(...pts.map((q) => q.y)), x1: Math.max(...pts.map((q) => q.x)), y1: Math.max(...pts.map((q) => q.y)) };
}

/**
 * Where a lid of its own lies by default (milestone 76, UI_CLEANUP_PLAN.md
 * Part 3): beside the box, at its front right, 20 mm clear of its walls,
 * along the box's own axes. The corner of the lid's outline nearest the
 * box's front left, in the box base's coordinates.
 */
export function lidBesideDefault(d: Design, box: Tray): { x: number; y: number } {
  const B = d.panels[box.baseId];
  const b = outlineBox(B);
  const m = matOf(d, box.baseId);
  return { x: b.x1 + m.thickness + LID_CLEAR, y: b.y0 - lidGap(d, box) };
}

/** The lid's outline (the box base's grown by the gap) and where it would sit on the box, in the box base's coordinates. */
function lidOutline(d: Design, box: Tray, B: Panel): { x0: number; y0: number; pts: SketchPt[]; edgeIds: string[]; round?: RoundShape } {
  const g = lidGap(d, box);
  const r = B.sketch.kind === 'poly' ? B.sketch.round : undefined;
  if (r) {
    // a round base: the same shape, every radius grown by the gap (an offset of a four-centre oval is one), its seam flat kept
    const round = { ...r, ...(r.rEnd !== undefined ? { rEnd: r.rEnd + g } : {}) };
    const rp = roundPts(B.w + 2 * g, B.h + 2 * g, round);
    return { x0: -g, y0: -g, pts: rp.pts, edgeIds: rp.edgeIds, round };
  }
  const src = B.sketch.kind === 'poly' ? B.sketch.pts : [];
  const grown = grownPts(src, g);
  // rounded corners lie inside their points: the points bound the outline
  const x0 = Math.min(...grown.map((q) => q.x)), y0 = Math.min(...grown.map((q) => q.y));
  return { x0, y0, pts: grown.map((q) => ({ ...q, x: q.x - x0, y: q.y - y0 })), edgeIds: B.sketch.kind === 'poly' ? [...B.sketch.edgeIds] : [] };
}

/**
 * The lid turned over and resting on its box (its underside a clearance above
 * the walls' tops): the pose of milestone 71, which *Put on* shows (milestone
 * 76). The lid's own outline and coordinates are the same in both poses.
 */
export function lidOnFrame(d: Design, lid: Panel, box: Tray): Panel['frame'] | null {
  const B = d.panels[box.baseId];
  if (!B || B.sketch.kind !== 'poly') return null;
  const { x0, y0 } = lidOutline(d, box, B);
  const up = matDir(B.frame);
  const lift = box.height + matOf(d, box.baseId).clearance + tOf(d, lid.id);
  const f = B.frame;
  const at = (k: number) => f.o[k] + f.u[k] * x0 + f.v[k] * y0 + up[k] * lift;
  return { o: [at(0), at(1), at(2)], u: [...f.u], v: [...f.v], side: (-f.side) as 1 | -1 };
}

/**
 * Put a lid's base where its box needs it: the box base's outline grown by
 * the gap (a round base stays round, its sizes grown), from (0, 0), lying
 * right side up beside the box (milestone 76; `Tray.lidAt` when the student
 * moved it): the box itself stays easy to edit. It is the pose on the box
 * turned half over about the box's u axis, so its pieces and their outline
 * are the same. Its shapes stay where they are on it.
 */
export function placeLid(d: Design, lid: Panel, box: Tray, at?: { x: number; y: number }) {
  const B = d.panels[box.baseId];
  if (!B || B.sketch.kind !== 'poly') return;
  const o = lidOutline(d, box, B);
  lid.sketch = { kind: 'poly', pts: o.pts, edgeIds: o.edgeIds, ...(o.round ? { round: o.round } : {}) };
  lid.w = Math.max(...o.pts.map((q) => q.x));
  lid.h = Math.max(...o.pts.map((q) => q.y));
  const p = at ?? box.lidAt ?? lidBesideDefault(d, box);
  const f = B.frame;
  // right side up: local x along the box's u, local y against its v (its front edge, y = h, nearest the box's front)
  const X = p.x, Y = p.y + lid.h;
  const pt = (k: number) => f.o[k] + f.u[k] * X + f.v[k] * Y;
  lid.frame = { o: [pt(0), pt(1), pt(2)], u: [...f.u], v: [-f.v[0], -f.v[1], -f.v[2]] as V3, side: (-f.side) as 1 | -1 };
}

/** The move (column-major 4 × 4, world) that takes a lid from beside its box onto it: what *Put on* shows. */
export function lidPutOn(d: Design, lidTray: Tray): number[] | null {
  const box = lidTray.lidOf ? d.trays[lidTray.lidOf] : undefined;
  const lid = d.panels[lidTray.baseId];
  if (!box || !lid) return null;
  const on = lidOnFrame(d, lid, box);
  if (!on) return null;
  const M = (f: Panel['frame']) => {
    const n = [f.u[1] * f.v[2] - f.u[2] * f.v[1], f.u[2] * f.v[0] - f.u[0] * f.v[2], f.u[0] * f.v[1] - f.u[1] * f.v[0]];
    return [f.u[0], f.u[1], f.u[2], 0, f.v[0], f.v[1], f.v[2], 0, n[0], n[1], n[2], 0, f.o[0], f.o[1], f.o[2], 1];
  };
  return mul(M(on), rigidInverse(M(lid.frame)));
}

/** a · b for column-major 4 × 4 matrices. */
function mul(a: number[], b: number[]): number[] {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return out;
}
/** The inverse of a rigid column-major 4 × 4 (a turn and a move). */
function rigidInverse(m: number[]): number[] {
  const R = (r: number, c: number) => m[c * 4 + r];
  const t = [m[12], m[13], m[14]];
  const out = new Array(16).fill(0);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out[c * 4 + r] = R(c, r);
  for (let r = 0; r < 3; r++) out[12 + r] = -(R(0, r) * t[0] + R(1, r) * t[1] + R(2, r) * t[2]);
  out[15] = 1;
  return out;
}

/**
 * A free spot beside the box for a new lid (milestone 76): the default, or
 * moved on in 10 mm steps along the box's u axis until its footprint touches
 * no other board on the floor. Null when the default is free.
 */
export function freeLidSpot(d: Design, box: Tray, lid: Panel): { x: number; y: number } | null {
  const B = d.panels[box.baseId];
  if (!B) return null;
  const at = lidBesideDefault(d, box);
  const g = lidGap(d, box);
  const w = B.w + 2 * g, h = B.h + 2 * g;
  const f = B.frame;
  // the floor footprints of every other root board (world x, z boxes), the box's and lid's own trays left out
  const skip = new Set<string>([box.baseId, lid.id]);
  const boxes: { x0: number; z0: number; x1: number; z1: number }[] = [];
  for (const id of d.order) {
    const P = d.panels[id];
    if (!P || skip.has(id) || P.place?.host || Object.values(d.connections).some((c) => c.grown && c.b.panelId === id)) continue;
    const cs = [toWorld(P.frame, 0, 0), toWorld(P.frame, P.w, 0), toWorld(P.frame, P.w, P.h), toWorld(P.frame, 0, P.h)];
    boxes.push({ x0: Math.min(...cs.map((c) => c[0])), z0: Math.min(...cs.map((c) => c[2])), x1: Math.max(...cs.map((c) => c[0])), z1: Math.max(...cs.map((c) => c[2])) });
  }
  const foot = (x: number) => {
    const cs = [[x, at.y], [x + w, at.y], [x + w, at.y + h], [x, at.y + h]].map(([a, b]) => [f.o[0] + f.u[0] * a + f.v[0] * b, f.o[2] + f.u[2] * a + f.v[2] * b]);
    return { x0: Math.min(...cs.map((c) => c[0])), z0: Math.min(...cs.map((c) => c[1])), x1: Math.max(...cs.map((c) => c[0])), z1: Math.max(...cs.map((c) => c[1])) };
  };
  const hits = (q: ReturnType<typeof foot>) => boxes.some((b) => q.x0 < b.x1 - 1e-6 && q.x1 > b.x0 + 1e-6 && q.z0 < b.z1 - 1e-6 && q.z1 > b.z0 + 1e-6);
  for (let k = 0; k < 200; k++) {
    const x = at.x + k * LID_STEP;
    if (!hits(foot(x))) return k === 0 ? null : { x, y: at.y };
  }
  return null;
}

/** Keep every lid on its box (`solve`, before trays are reconciled); a lid whose box went stays as a plain tray where it is. */
export function reconcileLids(d: Design) {
  for (const t of Object.values(d.trays ?? {})) {
    if (!t.lidOf) continue;
    const box = d.trays[t.lidOf];
    const lid = d.panels[t.baseId];
    if (!box || !d.panels[box.baseId] || !lid) {
      delete t.lidOf;
      continue;
    }
    placeLid(d, lid, box);
  }
}

/** The lid on a box's tray, if it has one. */
export const lidOn = (d: Design, trayId: string): Tray | undefined => Object.values(d.trays ?? {}).find((t) => t.lidOf === trayId);
