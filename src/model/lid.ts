// Telescoping lids (milestone 71, PACKAGING_PLAN.md §6.3; from the parked branch's milestone 46). A lid can't grow off
// a curved top edge (a curved crease can't fold with one side flat), so a lid
// for a box is a shallow tray of the box's outline, grown outward by the wall
// thickness and the fit clearance, turned over and resting on the box: a hat
// box lid. It is a tray like any other (`Tray.lidOf` names the box's tray);
// its base's outline and place follow the box on every solve.
import type { ConnGeom, Design, P2, Panel, RoundShape, SketchPt, Tray, V3 } from './types';
import { placeFrame } from './place';
import { toLocal, toWorld } from './frame';
import { findEdge as edgeOf } from './edges';
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
export function lidBesideDefault(d: Design, box: Tray, gap = lidGap(d, box)): { x: number; y: number } {
  const B = d.panels[box.baseId];
  const b = outlineBox(B);
  const m = matOf(d, box.baseId);
  return { x: b.x1 + m.thickness + LID_CLEAR, y: b.y0 - gap };
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
export function freeLidSpot(d: Design, box: Tray, lid: Panel, gap = lidGap(d, box)): { x: number; y: number } | null {
  const B = d.panels[box.baseId];
  if (!B) return null;
  const at = lidBesideDefault(d, box, gap);
  const w = B.w + 2 * gap, h = B.h + 2 * gap;
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

// ---------------------------------------------------------------------------
// The Flat lid (milestone 79, LIDS_LINES_PROJECTS_PLAN.md §3.2): one board
// resting on the walls' tops, a lip wider than the box all round, held in
// place by tabs on the walls' top edges through slots in it. It lies beside
// its box like a cap (milestone 76); its joint with each wall is derived on
// every solve (`lidtab:<lid>:<wall>`), worked out in its pose on the box.

/** The clearance round a Flat lid's tabs in its slots (mm): looser than a joint's, so it lifts. */
export const LID_FIT = 0.3;
/** How far a Flat lid stands out past the box (mm): the web a slot needs past its fit, and a lip to lift it by. */
export const flatLip = (d: Design, box: Tray) => Math.max(3, matOf(d, box.baseId).thickness) + LID_FIT / 2;

/** The one-board lids of a box. */
export const flatLidsOf = (d: Design, trayId: string): Panel[] => d.order.map((id) => d.panels[id]).filter((p) => p?.lidOf?.tray === trayId);

/**
 * Milestone 173 (UniversalBox's *flat* and *flatbrim* lids, plywood): a one-board lid with layers under it that locate
 * it inside the walls: a *plug* (a smaller board glued face to face under the top, `laminate`) or a *brim* (strips
 * standing under the top inside the walls, in slots). Its top stands a hair past the box all round (`LAYER_LIP`), as it
 * has no slots for the walls' tabs; the layers are boards placed on its underside, so they follow it.
 */
export const LAYER_LIP = 1;
/** Is a lid of its own one of the layered kinds (a plug or a brim under its top)? */
export const layeredLid = (L: Panel | undefined) => L?.lidOf?.kind === 'plug' || L?.lidOf?.kind === 'brim';
/** How far a one-board lid stands out past its box: a Flat lid's lip for its slots, a layered lid's hair. */
export const lidLipOf = (d: Design, lid: Panel, box: Tray) => (layeredLid(lid) ? LAYER_LIP : flatLip(d, box));
/** The boards placed on a lid's underside (its plug, its brim's strips) and on its top (a handle). */
export const lidLayers = (d: Design, lidId: string, face: 1 | -1): Panel[] => d.order.map((id) => d.panels[id]).filter((p) => p?.place?.host === lidId && p.place.face === face);
/** How far a lid's layers reach below its underside (mm): a plug's board, a brim's strips; nothing for a Flat lid. */
export function layerDepth(d: Design, lidId: string): number {
  return Math.max(0, ...lidLayers(d, lidId, -1).map((p) => (p.place!.pose === 'flat' ? tOf(d, p.id) : p.h)));
}

/** Where a Flat lid lies on its box: its underside on the walls' tops, the base's outline grown by the lip. */
export function flatOnFrame(d: Design, lid: Panel, box: Tray): Panel['frame'] | null {
  const B = d.panels[box.baseId];
  if (!B) return null;
  const b = outlineBox(B), g = lidLipOf(d, lid, box);
  const up = matDir(B.frame), f = B.frame;
  const at = (k: number) => f.o[k] + f.u[k] * (b.x0 - g) + f.v[k] * (b.y0 - g) + up[k] * box.height;
  return { o: [at(0), at(1), at(2)], u: [...f.u], v: [...f.v], side: f.side };
}

/** Give a Flat lid its outline (the base's grown by the lip) and its place beside the box. */
export function placeFlatLid(d: Design, lid: Panel, box: Tray) {
  const B = d.panels[box.baseId];
  if (!B || B.sketch.kind !== 'poly') return;
  const g = lidLipOf(d, lid, box);
  const grown = grownPts(B.sketch.pts, g);
  const x0 = Math.min(...grown.map((q) => q.x)), y0 = Math.min(...grown.map((q) => q.y));
  const pts = grown.map((q) => ({ ...q, x: q.x - x0, y: q.y - y0 }));
  lid.sketch = { kind: 'poly', pts, edgeIds: [...B.sketch.edgeIds] };
  lid.w = Math.max(...pts.map((q) => q.x));
  lid.h = Math.max(...pts.map((q) => q.y));
  const p = box.lidAt ?? lidBesideDefault(d, box, g);
  const f = B.frame;
  // a layered lid lies beside its box on its plug or brim, as it is set down on a table (milestone 173)
  const up = matDir(f), lift = layerDepth(d, lid.id);
  const pt = (k: number) => f.o[k] + f.u[k] * p.x + f.v[k] * p.y + up[k] * lift;
  lid.frame = { o: [pt(0), pt(1), pt(2)], u: [...f.u], v: [...f.v], side: f.side };
}

/** The move (column-major 4 × 4) that puts a box's lid of its own on the box: a cap or a Flat lid. */
export function boxLidPutOn(d: Design, trayId: string): number[] | null {
  const cap = lidOn(d, trayId);
  if (cap) return lidPutOn(d, cap);
  const box = d.trays[trayId];
  const L = flatLidsOf(d, trayId)[0];
  const on = box && L && (L.lidOf?.kind === 'dropin' ? dropinOnFrame(d, L, box) : flatOnFrame(d, L, box));
  if (!on) return null;
  return mul(frameMat(on), rigidInverse(frameMat(L.frame)));
}
const frameMat = (f: Panel['frame']) => {
  const n = [f.u[1] * f.v[2] - f.u[2] * f.v[1], f.u[2] * f.v[0] - f.u[0] * f.v[2], f.u[0] * f.v[1] - f.u[1] * f.v[0]];
  return [f.u[0], f.u[1], f.u[2], 0, f.v[0], f.v[1], f.v[2], 0, n[0], n[1], n[2], 0, f.o[0], f.o[1], f.o[2], 1];
};

/** The id of a Flat lid's joint with a wall. */
export const lidTabId = (lid: string, wall: string) => `lidtab:${lid}:${wall}`;

/**
 * Keep every Flat lid beside its box, and its joints with the walls (`solve`,
 * once the walls are placed). A lid whose box went stays a plain board.
 */
export function reconcileFlatLids(d: Design, ring: (t: Tray) => string[]) {
  const want = new Set<string>();
  for (const id of d.order) {
    const L = d.panels[id];
    if (!L?.lidOf) continue;
    const box = d.trays?.[L.lidOf.tray];
    if (!box || !d.panels[box.baseId]) {
      delete L.lidOf;
      continue;
    }
    if (L.lidOf.kind === 'dropin') {
      // a Drop-in lid: no joint, it rests on the dividers
      placeDropinLid(d, L, box);
      continue;
    }
    if (layeredLid(L)) {
      // a plug or brim lid (milestone 173): no tabs; its plug keeps to the box's inside, and its layers follow it
      placeFlatLid(d, L, box);
      fitPlug(d, L, box);
      followHost(d, L.id);
      continue;
    }
    placeFlatLid(d, L, box);
    for (const w of ring(box)) {
      const cid = lidTabId(L.id, w);
      want.add(cid);
      if (!d.connections[cid]) d.connections[cid] = { id: cid, kind: 'closure', a: { panelId: w, edge: 'e2' }, b: { panelId: L.id, edge: 'face' }, grown: false, angle: 90, dir: 'up', offset: 0, fingers: null, tabs: null, flap: null, foldDir: 'valley', auto: true, covers: [L.id] };
    }
  }
  for (const c of Object.values(d.connections)) if (c.id.startsWith('lidtab:') && !want.has(c.id)) delete d.connections[c.id];
}

/**
 * A Flat lid's joint with one wall: tabs on the wall's straight top edge (one
 * under 80 mm, two above; none under 30 mm), as tall as the lid is thick so
 * they are flush with its top, through slots in the lid where the tabs are when
 * it rests on the box, the fit all round.
 */
export function flatLidGeom(d: Design, c: { a: { panelId: string }; b: { panelId: string } }): ConnGeom | null {
  const W = d.panels[c.a.panelId], L = d.panels[c.b.panelId];
  const box = L?.lidOf ? d.trays?.[L.lidOf.tray] : undefined;
  if (!W || !L || !box) return null;
  const g: ConnGeom = { edges: [], holes: [], adds: [], scores: [], flaps3d: [] };
  const top = edgeOf(W, 'e2');
  if (!top) return g;
  const len = Math.hypot(top.b.x - top.a.x, top.b.y - top.a.y);
  if (len < 30) return g;
  const on = flatOnFrame(d, L, box);
  if (!on) return g;
  const tW = tOf(d, W.id), tL = tOf(d, L.id);
  const ux = (top.b.x - top.a.x) / len, uy = (top.b.y - top.a.y) / len;
  // the front wall (on the base's first edge) carries the hasps instead of its tabs (milestone 82): tongues through the lid, a padlock hole above it
  const front = Object.values(d.connections).some((x) => x.grown && x.a.panelId === box.baseId && x.b.panelId === W.id && x.a.edge.split('#')[0] === 'e0');
  const hasps = front ? L.lidOf?.hasps : undefined;
  let notches: { s0: number; s1: number; depth: number }[];
  if (hasps) {
    const web = Math.max(4, tW + 1), tw = hasps.hole + 2 * web;
    notches = Array.from({ length: hasps.n }, (_, i) => (i + 1) / (hasps.n + 1)).map((f) => ({ s0: f * len - tw / 2, s1: f * len + tw / 2, depth: -(tL + 1 + hasps.hole + web) }));
    // the padlock's hole in each tongue: its lowest point 1 mm above the lid's top
    const out = { x: uy, y: -ux };
    // away from the wall's middle: up past its top edge
    const toEdge = { x: (top.a.x + top.b.x) / 2 - W.w / 2, y: (top.a.y + top.b.y) / 2 - W.h / 2 };
    const sgn = out.x * toEdge.x + out.y * toEdge.y >= 0 ? 1 : -1;
    for (const n of notches) {
      const s = (n.s0 + n.s1) / 2, up = tL + 1 + hasps.hole / 2;
      const cx = top.a.x + ux * s + out.x * sgn * up, cy = top.a.y + uy * s + out.y * sgn * up;
      g.holes.push({ panelId: W.id, poly: Array.from({ length: 36 }, (_, k) => ({ x: cx + (hasps.hole / 2) * Math.cos((k * Math.PI) / 18), y: cy + (hasps.hole / 2) * Math.sin((k * Math.PI) / 18) })) });
    }
  } else {
    const tw = Math.min(len / 4, Math.max(8, 3 * tW));
    const at = len < 80 ? [0.5] : [0.25, 0.75];
    notches = at.map((f) => ({ s0: f * len - tw / 2, s1: f * len + tw / 2, depth: -tL }));
  }
  g.edges.push({ panelId: W.id, edge: 'e2', notches });
  for (const n of notches) {
    // the tab's footprint at the lid's underside, in the lid's coordinates when it rests on the box
    const corner = (s: number, z: number) => toLocal(on, toWorld(W.frame, top.a.x + ux * s, top.a.y + uy * s, z));
    const q = [corner(n.s0, 0), corner(n.s1, 0), corner(n.s1, tW), corner(n.s0, tW)];
    // grown by half the fit on every side: along the tab and across the wall
    const along = { x: q[1].x - q[0].x, y: q[1].y - q[0].y }, across = { x: q[3].x - q[0].x, y: q[3].y - q[0].y };
    const la = Math.hypot(along.x, along.y) || 1, lc = Math.hypot(across.x, across.y) || 1;
    const h = LID_FIT / 2;
    const sa = [-1, 1, 1, -1], sc = [-1, -1, 1, 1];
    const grow = (p: { x: number; y: number }, i: number) => ({ x: p.x + (along.x / la) * h * sa[i] + (across.x / lc) * h * sc[i], y: p.y + (along.y / la) * h * sa[i] + (across.y / lc) * h * sc[i] });
    g.holes.push({ panelId: L.id, poly: q.map(grow) });
  }
  return g;
}

// ---------------------------------------------------------------------------
// The Drop-in lid (milestone 80, LIDS_LINES_PROJECTS_PLAN.md §3.2): one board
// inside the walls, the box's inside less the fit, resting on the dividers'
// tops, with a finger hole kept clear of them. The walls stand above it and
// the contents are held down. It lies beside its box like the others.

/** A Drop-in lid's finger hole (mm across). */
export const FINGER_HOLE = 20;

/** The dividers standing on a box's base. */
export const boxDividers = (d: Design, box: Tray): Panel[] => d.order.map((id) => d.panels[id]).filter((p) => p?.divider && p.place?.host === box.baseId);

/** The box's inside, less the fit: the Drop-in lid's outline in the base's coordinates (its points, and the lowest corner). */
function dropinOutline(d: Design, box: Tray): { pts: SketchPt[]; edgeIds: string[]; x0: number; y0: number; round?: RoundShape } | null {
  const B = d.panels[box.baseId];
  if (!B || B.sketch.kind !== 'poly') return null;
  const g = matOf(d, box.baseId).thickness + LID_FIT;
  const r = B.sketch.round;
  if (r) {
    if (B.w - 2 * g < 10 || B.h - 2 * g < 10) return null;
    const round = { ...r, ...(r.rEnd !== undefined ? { rEnd: Math.max(1, r.rEnd - g) } : {}) };
    const rp = roundPts(B.w - 2 * g, B.h - 2 * g, round);
    return { pts: rp.pts, edgeIds: rp.edgeIds, x0: g, y0: g, round };
  }
  const shrunk = grownPts(B.sketch.pts, -g).map((q) => (q.curve === 'round' && q.r !== undefined ? { ...q, r: Math.max(0.5, q.r) } : q));
  const x0 = Math.min(...shrunk.map((q) => q.x)), y0 = Math.min(...shrunk.map((q) => q.y));
  return { pts: shrunk.map((q) => ({ ...q, x: q.x - x0, y: q.y - y0 })), edgeIds: [...B.sketch.edgeIds], x0, y0 };
}

/** Milestone 184: the corner blocks a box's top is screwed onto (`Panel.fitting 'block'`, joined to its walls; a layer glued under one is not). */
export function cornerBlocks(d: Design, box: Tray): Panel[] {
  const walls = new Set(Object.values(d.connections).filter((c) => c.grown && c.trayId === box.id && c.a.panelId === box.baseId).map((c) => c.b.panelId));
  return d.order
    .map((id) => d.panels[id])
    .filter((p) => p?.fitting === 'block' && Object.values(d.connections).some((c) => (c.a.panelId === p.id && walls.has(c.b.panelId)) || (c.b.panelId === p.id && walls.has(c.a.panelId))));
}

/** The height a Drop-in lid rests at over the base's frame: on the tallest divider. */
export function dropinRest(d: Design, box: Tray): number {
  const B = d.panels[box.baseId];
  // milestone 184: a top screwed on corner blocks rests on them, its top flush with the walls'
  const blocks = cornerBlocks(d, box);
  if (B && blocks.length) {
    const up = matDir(B.frame);
    const lift = (p: Panel) => (p.frame.o[0] - B.frame.o[0]) * up[0] + (p.frame.o[1] - B.frame.o[1]) * up[1] + (p.frame.o[2] - B.frame.o[2]) * up[2] + tOf(d, p.id);
    return Math.max(...blocks.map(lift));
  }
  const tops = boxDividers(d, box).map((p) => p.h);
  return (B ? tOf(d, B.id) : 0) + (tops.length ? Math.max(...tops) : box.height / 2);
}

/** Where a Drop-in lid rests in its box. */
export function dropinOnFrame(d: Design, lid: Panel, box: Tray): Panel['frame'] | null {
  const B = d.panels[box.baseId];
  const o = dropinOutline(d, box);
  if (!B || !o) return null;
  const up = matDir(B.frame), f = B.frame, z = dropinRest(d, box);
  const at = (k: number) => f.o[k] + f.u[k] * o.x0 + f.v[k] * o.y0 + up[k] * z;
  return { o: [at(0), at(1), at(2)], u: [...f.u], v: [...f.v], side: f.side };
}

/** Give a Drop-in lid its outline and its place beside the box, and keep its finger hole clear of the dividers. */
export function placeDropinLid(d: Design, lid: Panel, box: Tray) {
  const B = d.panels[box.baseId];
  const o = dropinOutline(d, box);
  if (!B || !o) return;
  lid.sketch = { kind: 'poly', pts: o.pts, edgeIds: o.edgeIds, ...(o.round ? { round: o.round } : {}) };
  lid.w = Math.max(...o.pts.map((q) => q.x));
  lid.h = Math.max(...o.pts.map((q) => q.y));
  const p = box.lidAt ?? lidBesideDefault(d, box, -o.x0);
  const f = B.frame;
  const pt = (k: number) => f.o[k] + f.u[k] * p.x + f.v[k] * p.y;
  lid.frame = { o: [pt(0), pt(1), pt(2)], u: [...f.u], v: [...f.v], side: f.side };
  // the finger hole: at the middle, or the nearest spot clear of every divider under it
  const hole = lid.details.find((x) => x.id === fingerId(lid.id));
  if (hole) {
    const at = fingerSpot(d, box, lid, o.x0, o.y0);
    hole.cx = at.x;
    hole.cy = at.y;
  }
}
export const fingerId = (lidId: string) => `${lidId}:finger`;

/** A spot for the finger hole: the lid's middle, else the nearest (in 5 mm steps) whose hole clears every divider by its thickness. */
function fingerSpot(d: Design, box: Tray, lid: Panel, x0: number, y0: number): P2 {
  const divs = boxDividers(d, box).map((p) => {
    const a = (p.place!.rot * Math.PI) / 180;
    const A = { x: p.place!.x - x0, y: p.place!.y - y0 };
    return { A, B: { x: A.x + Math.cos(a) * p.w, y: A.y + Math.sin(a) * p.w }, t: tOf(d, p.id) };
  });
  const clear = (q: P2) =>
    divs.every((s) => {
      const vx = s.B.x - s.A.x, vy = s.B.y - s.A.y, L2 = vx * vx + vy * vy || 1;
      const k = Math.max(0, Math.min(1, ((q.x - s.A.x) * vx + (q.y - s.A.y) * vy) / L2));
      return Math.hypot(q.x - s.A.x - vx * k, q.y - s.A.y - vy * k) > FINGER_HOLE / 2 + s.t + 2;
    }) &&
    q.x > FINGER_HOLE / 2 + 3 && q.y > FINGER_HOLE / 2 + 3 && q.x < lid.w - FINGER_HOLE / 2 - 3 && q.y < lid.h - FINGER_HOLE / 2 - 3;
  const c = { x: lid.w / 2, y: lid.h / 2 };
  for (let r = 0; r <= 200; r += 5)
    for (const [dx, dy] of r === 0 ? [[0, 0]] : [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, r], [r, -r], [-r, -r]]) {
      const q = { x: c.x + dx, y: c.y + dy };
      if (clear(q)) return q;
    }
  return c;
}

/** A padlock's hole sizes on offer (mm): a luggage padlock's shackle is 3–4 mm, a classroom one's 5–6. */
export const HASP_HOLES = [6, 8, 10] as const;

// ---------------------------------------------------------------------------
// Layered lids (milestone 173): the plug under a plug lid's top, and every board placed on a lid, kept with it.

/** The play round a plug inside the walls (mm, each side): as a Drop-in lid's. */
export const PLUG_FIT = LID_FIT;

/** A plug's outline: the box's inside less the play, in the base's coordinates (its points and its lowest corner). */
export function plugOutline(d: Design, box: Tray): { pts: SketchPt[]; edgeIds: string[]; x0: number; y0: number } | null {
  const B = d.panels[box.baseId];
  if (!B || B.sketch.kind !== 'poly' || B.sketch.round || B.sketch.pts.some((q) => q.curve)) return null;
  const g = matOf(d, box.baseId).thickness + PLUG_FIT;
  const shrunk = grownPts(B.sketch.pts, -g);
  const x0 = Math.min(...shrunk.map((q) => q.x)), y0 = Math.min(...shrunk.map((q) => q.y));
  const pts = shrunk.map((q) => ({ x: q.x - x0, y: q.y - y0 }));
  if (Math.max(...pts.map((q) => q.x)) < 10 || Math.max(...pts.map((q) => q.y)) < 10) return null;
  return { pts, edgeIds: [...B.sketch.edgeIds], x0, y0 };
}

/** Keep a plug lid's plug (the board laid flat on its underside) to the box's inside, and where it is under the top. */
function fitPlug(d: Design, L: Panel, box: Tray) {
  if (L.lidOf?.kind !== 'plug') return;
  const B = d.panels[box.baseId];
  const o = plugOutline(d, box);
  if (!B || B.sketch.kind !== 'poly' || !o) return;
  // the top's own (0, 0) is the base's outline grown by the lip: its lowest corner
  const top = grownPts(B.sketch.pts, LAYER_LIP);
  const tx = Math.min(...top.map((q) => q.x)), ty = Math.min(...top.map((q) => q.y));
  for (const P of lidLayers(d, L.id, -1)) {
    if (P.place?.pose !== 'flat') continue;
    P.sketch = { kind: 'poly', pts: o.pts.map((q) => ({ ...q })), edgeIds: [...o.edgeIds] };
    P.w = Math.max(...o.pts.map((q) => q.x));
    P.h = Math.max(...o.pts.map((q) => q.y));
    P.place = { ...P.place, x: o.x0 - tx, y: o.y0 - ty, rot: 0 };
  }
}

/** The boards placed on a board, and theirs, follow it now (their frames from its, as `solve` derives them). */
export function followHost(d: Design, hostId: string) {
  for (const id of d.order) {
    const P = d.panels[id];
    if (P?.place?.host !== hostId) continue;
    const f = placeFrame(d, P.place);
    if (f) P.frame = f;
    followHost(d, id);
  }
}
