// Boxes with a door of living hinge (milestones 174–175, BOXES_PLYWOOD_PLAN.md §2, §3.5). Plywood only
// (`plywoodOnly`). Constructions read in boxes.py (a behaviour reference only: THIRD_PARTY.md) and written fresh:
//   a roll-top box  side walls with a rounded top corner (or two); a door of living hinge that runs in a groove round
//                   the corner (shutterbox), or from the front up over the top to the back (breadbox). In the open
//                   part of the box the groove is two rails glued on each side wall; where the door goes when open
//                   it runs between the box's own boards and an inner shell (a board with a living-hinge band at its
//                   corner, held in slots), with a filler glued in the corner outside its bend. A handle stands on the
//                   door's end and stops it at the edge of the opening.
import type { Design, P2, V3 } from '../../model/types';
import type { MsgKey } from '../../i18n';
import type { ParamDef, Params, TemplateDef } from '../types';
import { laminateBoards, placeBoardOn, connectSeams, deletePanel, growPanel, setCustomHeight, setPanelSize, setWallCorner, addWallInsert, solve } from '../../model/ops';
import { straightRing, segInward, segLength } from '../../model/edges';
import { minWeb } from '../../model/materials';
import { addFlexStrip, addStripHandle, endRoom, insetPath, legAt, legSpans, pathBand, pathLength, slitStrip, stripReach, uAt, type FlexPath, type FlexPlane, type StripBoard } from '../../model/tambour';
import { boardBoxRect, plywoodOnly } from './boards';
import { slidePlay } from './boardBoxes';
import { cleanAll, cleanWith, mainTray } from './box';
import { nameAll, sheetLimits, wallsOf } from './shaped';

type Role = (name: string, id: string) => void;
const num = (key: string, label: MsgKey, min: number, max: number, dflt: number): ParamDef => ({ key, label, type: 'number', unit: 'mm', min, max, default: dflt });

export type Roll = 'one' | 'two' | 'bread';
export type DoorAt = 'shut' | 'half' | 'open';

/** A gap left between a guide and a board it does not join (mm): they are glued only where they should be. */
const GAP = 1;

/** Where the door's parts are, worked out from the words (no design): or why it cannot be made. */
export type RollLayout = {
  roll: Roll;
  W: number;
  D: number;
  H: number;
  R: number;
  t: number;
  play: number;
  /** The door's outer face's path, its inner shell's, and the door's length along it. */
  path: FlexPath;
  shell: FlexPath;
  Ld: number;
  door: { w: number; handle: 'start' | 'end'; from: number; h: number; hw: number; keep: number };
  /** Where the door starts along the path when shut, half open and open. */
  at: Record<DoorAt, number>;
  /** The opening's edge: the front (and back) wall's top, or the fixed top's front edge (bread box), and where the guides run. */
  stop: number;
  stopBack?: number;
  rails: [number, number];
  shellAt: [number, number];
  /** The inner corners a filler is glued in: the corner's index on the path. */
  fillers: number[];
};

/** The door's handle: how far in from its end, how tall, the length kept whole for it. */
function handleOf(t: number, m: { clearance: number }) {
  const from = Math.max(2 * t, minWeb({ kind: 'plywood' } as Parameters<typeof minWeb>[0]) + 1 + m.clearance);
  const h = Math.max(2 * t, 8);
  return { from, h, keep: from + t + 3 };
}

/** How far into the storage a shut door reaches past the opening's edge (it stays in its groove). */
const overlap = (t: number) => Math.max(8, 2 * t);

/**
 * The roll-top box's layout, in the side wall's plane: s from the back (0) to the front (D), y up from the table. The
 * door's outer face runs `t + play` in from the box's outline, round every corner at R less that; the shell's outer
 * face `t + play` in from the door's.
 */
export function rollLayout(roll: Roll, W: number, D: number, H: number, R: number, t: number, clearance: number): RollLayout | { why: MsgKey } {
  const play = slidePlay(t, clearance);
  const tp = t + play;
  const Ro = R - tp;
  const hd = handleOf(t, { clearance });
  const hz = hd.from + t + GAP + 3;
  const cl = Math.max(1, play);
  const dw = W - 2 * t - 2 * play;
  const BF = { x: D - tp, y: tp }, TF = { x: D - tp, y: H - tp }, TB = { x: tp, y: H - tp };
  let pts: P2[];
  let stop: number, stopBack: number | undefined;
  if (roll === 'bread') {
    // the front, up over the top, down the back; the opening's edge is the fixed top's front edge
    stop = Math.min(D / 2, D - R - hz);
    pts = [{ x: D - tp, y: t }, TF, TB, { x: tp, y: t }];
  } else {
    stop = H - R - hz;
    if (roll === 'two') {
      stopBack = stop;
      pts = [{ x: t, y: tp }, BF, TF, TB, { x: tp, y: stopBack + GAP + hd.from + t + 2 }];
    } else pts = [{ x: t, y: tp }, BF, TF, { x: t, y: H - tp }];
  }
  if (Ro <= 2 * t + 2) return { why: 'sen.why.rollRadius' };
  const path: FlexPath = { pts, Ro, t, k: 0.5, turn: 1 };
  const shell = insetPath(path, tp);
  const sp = legSpans(path);
  const total = pathLength(path);
  // a point on a leg by its coordinate along it (s on a level leg, y on an upright one)
  const at = (leg: number, c: number) => {
    const a = path.pts[leg], b = path.pts[leg + 1];
    const level = Math.abs(a.y - b.y) < 1e-6;
    const x = level ? Math.abs(c - a.x) : Math.abs(c - a.y);
    return uAt(path, leg, x);
  };
  let Ld: number, shut: number, open: number, rails: [number, number], shellAt: [number, number];
  const ov = overlap(t);
  if (roll === 'bread') {
    // shut: the handle end on the base; open: the handle just in front of the fixed top
    shut = at(0, t + cl);
    Ld = at(1, stop - ov) - shut;
    open = at(1, stop + GAP + hd.from + t);
    rails = [at(0, t + GAP), at(1, stop + GAP)];
    // the shell from under the fixed top's front edge, round the back corner, down to the base
    const ssp = legSpans(shell);
    shellAt = [uAt(shell, 1, Math.abs(stop - shell.pts[1].x)), ssp[2].u0 + ssp[2].hi - ssp[2].lo];
  } else {
    const end = roll === 'two' ? 3 : 2;
    // shut: the handle end at the far end; open: the handle just over the front wall
    const far = total - (roll === 'one' ? cl - 0 : 0);
    shut = far;
    Ld = far - at(1, stop - ov);
    open = at(1, stop + GAP + hd.from + t) - Ld;
    shut = shut - Ld;
    rails = [at(1, stop + GAP), roll === 'one' ? total - (GAP - 0) : at(end, (stopBack ?? stop) + GAP)];
    if (roll === 'one') rails[1] = uAt(path, 2, Math.abs(path.pts[2].x - (t + GAP)));
    const ssp = legSpans(shell);
    shellAt = [0, uAt(shell, 1, Math.abs(stop - shell.pts[1].y))];
    void ssp;
  }
  if (Ld <= 0 || !Number.isFinite(Ld)) return { why: 'sen.why.rollRoom' };
  // open, the whole door in its storage; each end on a straight run, not in a band
  const openStart = roll === 'bread' ? open : open;
  if (openStart < -1e-6 || openStart + Ld > total + 1e-6) return { why: 'sen.why.rollRoom' };
  if (endRoom(path, shut, shut + Ld) < 3 || endRoom(path, open, open + Ld) < 3) return { why: 'sen.why.rollRoom' };
  // the shell's band and its straight boards
  if (shell.Ro - t < 2 || endRoom(shell, shellAt[0], shellAt[1]) < 3) return { why: 'sen.why.rollRadius' };
  // half open: half way, moved on until both ends are on straight runs
  let half = (shut + open) / 2;
  for (let k = 0; k < 40 && endRoom(path, half, half + Ld) < 3; k++) half += (k % 2 ? -1 : 1) * (k + 1) * 2;
  if (endRoom(path, half, half + Ld) < 3) half = open;
  void sp;
  return {
    roll, W, D, H, R, t, play, path, shell, Ld,
    door: { w: dw, handle: roll === 'bread' ? 'start' : 'end', from: hd.from, h: hd.h, hw: dw - 2 * t - 2, keep: hd.keep },
    at: { shut, half, open },
    stop, ...(stopBack !== undefined ? { stopBack } : {}),
    rails, shellAt,
    fillers: roll === 'bread' ? [1] : [0],
  };
}

/** The corners a side wall's outline is rounded at, by roll: the top front, and the top back for two. */
const rounded = (roll: Roll) => (roll === 'two' ? ['front', 'back'] : ['front']);

/** A side wall's top outline from its front corner to its back one, in (s, y): straight, and round its rounded corners. */
function sideTop(roll: Roll, D: number, H: number, R: number): P2[] {
  const arc = (cx: number, cy: number, a0: number, a1: number) => Array.from({ length: 13 }, (_, i) => {
    const a = ((a0 + ((a1 - a0) * i) / 12) * Math.PI) / 180;
    return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
  });
  const out = arc(D - R, H - R, 0, 90);
  if (rounded(roll).includes('back')) out.push(...arc(R, H - R, 90, 180));
  else out.push({ x: 0, y: H });
  return out;
}

/** Shape a side wall's top to the outline (s, y): its corners moved, the points between inserted on its top edge. */
function shapeSide(d: Design, wallId: string, top: P2[], mirror: boolean, D: number) {
  const P = d.panels[wallId];
  if (!P || P.sketch.kind !== 'wall') return;
  // the wall's own x: s on one side wall, D − s on the other
  const loc = top.map((q) => ({ x: mirror ? D - q.x : q.x, y: q.y }));
  const atRight = loc[0].x > loc[loc.length - 1].x ? loc[0] : loc[loc.length - 1];
  const atLeft = atRight === loc[0] ? loc[loc.length - 1] : loc[0];
  setWallCorner(d, wallId, 'tr', { dx: 0, dy: atRight.y - P.h });
  setWallCorner(d, wallId, 'tl', { dx: 0, dy: atLeft.y - P.h });
  const e2 = straightRing(d.panels[wallId]).find((e) => e.key === 'e2');
  if (!e2) return;
  const L = segLength(e2), inw = segInward(e2);
  const dir = { x: (e2.b.x - e2.a.x) / L, y: (e2.b.y - e2.a.y) / L };
  for (const q of loc) {
    if (q === atRight || q === atLeft) continue;
    const r = { x: q.x - e2.a.x, y: q.y - e2.a.y };
    const tt = (r.x * dir.x + r.y * dir.y) / L;
    const off = -(r.x * inw.x + r.y * inw.y);
    if (tt <= 1e-4 || tt >= 1 - 1e-4) continue;
    addWallInsert(d, wallId, 'e2', tt, off);
  }
}

/** A guide glued on a side wall's inner face: its outline in (s, y), turned into the wall's own coordinates. */
function glueOn(d: Design, wallId: string, pts: P2[], mirror: boolean, D: number): string | null {
  if (pts.length < 3) return null;
  let loc = pts.map((q) => ({ x: mirror ? D - q.x : q.x, y: q.y }));
  // counter-clockwise, as a board's outline is
  let a = 0;
  for (let i = 0; i < loc.length; i++) a += loc[i].x * loc[(i + 1) % loc.length].y - loc[(i + 1) % loc.length].x * loc[i].y;
  if (a < 0) loc = loc.reverse();
  const x0 = Math.min(...loc.map((q) => q.x)), y0 = Math.min(...loc.map((q) => q.y));
  const id = placeBoardOn(d, wallId, { face: 1, x: x0, y: y0, rot: 0, pose: 'flat' }, loc.map((q) => ({ x: q.x - x0, y: q.y - y0 })));
  laminateBoards(d, wallId, id);
  return id;
}

/** The filler in an inner corner (s, y): the corner between the walls' faces, outside the door's bend, kept clear of the walls. */
function fillerOutline(L: RollLayout, corner: number): P2[] {
  const p = L.path;
  const i = corner;
  const a = p.pts[i], K = p.pts[i + 1], b = p.pts[i + 2];
  const da = { x: (K.x - a.x) / Math.hypot(K.x - a.x, K.y - a.y), y: (K.y - a.y) / Math.hypot(K.x - a.x, K.y - a.y) };
  const db = { x: (b.x - K.x) / Math.hypot(b.x - K.x, b.y - K.y), y: (b.y - K.y) / Math.hypot(b.x - K.x, b.y - K.y) };
  const na = { x: -da.y, y: da.x }, nb = { x: -db.y, y: db.x };
  const C = { x: K.x + p.Ro * (na.x + nb.x), y: K.y + p.Ro * (na.y + nb.y) };
  // the walls' faces lie `play` outside the door's outer face; the filler stays GAP inside them
  const out = L.play / 2;
  const Rf = p.Ro + L.play;
  const corner2 = { x: K.x - (na.x + nb.x) * out, y: K.y - (na.y + nb.y) * out };
  // its ends where it is 1.5 mm thick: the arc's angle from each tangent
  const c = 1 - (1.5 + L.play / 2) / Rf;
  const f0 = Math.acos(Math.max(-1, Math.min(1, c))) / (Math.PI / 2);
  const arcPt = (f: number) => {
    const th = (f * Math.PI) / 2;
    return { x: C.x + Rf * (-na.x * Math.cos(th) - nb.x * Math.sin(th)), y: C.y + Rf * (-na.y * Math.cos(th) - nb.y * Math.sin(th)) };
  };
  const pts: P2[] = [];
  const n = 12;
  for (let j = 0; j <= n; j++) pts.push(arcPt(f0 + ((1 - 2 * f0) * j) / n));
  // out to the second wall's face line, round the corner, back to the first's
  const end = pts[pts.length - 1], start = pts[0];
  // each end straight out to its wall's line (the line through the corner along that leg)
  const proj = (q: P2, n: P2) => {
    const k = (q.x - corner2.x) * -n.x + (q.y - corner2.y) * -n.y;
    return { x: q.x + n.x * k, y: q.y + n.y * k };
  };
  const onB = proj(end, nb), onA = proj(start, na);
  pts.push(onB, corner2, onA);
  return pts;
}

/** The plane of the side walls: s along z from the back, y up; across along x. */
const planeOf = (D: number): FlexPlane => ({ O: [0, 0, -D / 2] as V3, S: [0, 0, 1] as V3, Y: [0, 1, 0] as V3 });

function generateRollTop(d: Design, p: Params, role: Role) {
  const roll = (['one', 'two', 'bread'].includes(String(p.roll)) ? p.roll : 'one') as Roll;
  const W = Number(p.width), D = Number(p.depth), H = Number(p.height);
  const t = d.material.thickness;
  const R = Math.min(Number(p.radius), maxRadius(roll, D, H));
  const L = rollLayout(roll, W, D, H, R, t, d.material.clearance);
  if ('why' in L) return;
  if (!boardBoxRect(d, W, D, H)) return;
  const tr = mainTray(d)!;
  const w = wallsOf(d);
  const named: Record<string, string> = {};
  // the opening: the front wall lowered to it (and the back for two), or taken away (a bread box's open front)
  if (roll === 'bread') {
    if (w.e0) deletePanel(d, w.e0);
  } else {
    for (const e of roll === 'two' ? ['e0', 'e2'] : ['e0']) {
      if (!w[e]) continue;
      setCustomHeight(d, w[e], true);
      setPanelSize(d, w[e], undefined, L.stop);
    }
  }
  // the side walls' rounded corners (e3 runs from the back to the front, e1 from the front to the back)
  const top = sideTop(roll, D, H, R);
  if (w.e3) shapeSide(d, w.e3, top, false, D);
  if (w.e1) shapeSide(d, w.e1, top, true, D);
  solve(d);
  // a bread box's fixed top over the back, grown off the back wall's top as a closed top is, as far as the opening
  if (roll === 'bread' && w.e2) {
    const g = growPanel(d, w.e2, 'e2', { height: 10, angle: 90, dir: 'up', kind: 'finger' });
    if (g) {
      const T = d.panels[g.panelId];
      const back = d.panels[w.e2];
      // its v runs forward from the back wall's top: as far as the opening's edge
      const reach = L.stop - (T.frame.o[2] + D / 2) - 0;
      void back;
      setPanelSize(d, g.panelId, undefined, Math.max(10, reach));
      solve(d);
      connectSeams(d, g.panelId);
      solve(d);
      named.top = g.panelId;
    }
  }
  // the rails: on each side wall's inner face, one outside the groove (to the outline) and one inside it
  const wi = Math.max(t, 5);
  const guides: string[] = [];
  for (const [e, mirror] of [['e3', false], ['e1', true]] as const) {
    if (!w[e]) continue;
    const outer = pathBand(L.path, L.play, L.play + t, L.rails[0], L.rails[1]);
    const inner = pathBand(L.path, -t - L.play - wi, -t - L.play, L.rails[0], L.rails[1]);
    for (const pts of [outer, inner]) {
      const id = glueOn(d, w[e], pts, mirror, D);
      if (id) guides.push(id);
    }
    for (const c of L.fillers) {
      const id = glueOn(d, w[e], fillerOutline(L, c), mirror, D);
      if (id) guides.push(id);
    }
  }
  solve(d);
  // the shell: the storage's inner side, a band at its corner, held in the side walls (and the back wall or base)
  const pl = planeOf(D);
  const shell = addFlexStrip(d, pl, L.shell, W - 2 * t, L.shellAt[0], L.shellAt[1]);
  if (shell) for (const b of shell) connectSeams(d, b.id);
  // the door, where the words put it (half open: its picture shows how it opens)
  const at = (['shut', 'half', 'open'].includes(String(p.doorAt)) ? p.doorAt : 'half') as DoorAt;
  const door = addFlexStrip(d, pl, L.path, L.door.w, L.at[at], L.at[at] + L.Ld);
  let handle: string | null = null;
  if (door) {
    slitStrip(d, door, L.door.w, { at: L.door.handle, len: L.door.keep });
    const hb = L.door.handle === 'start' ? door[0] : door[door.length - 1];
    handle = addStripHandle(d, { ...hb, end: L.door.handle }, L.door.hw, L.door.from, L.door.h);
  }
  solve(d);
  void tr;
  const first: Record<string, string> = { ...named };
  (door ?? []).forEach((b, i) => (first[`door-${i + 1}`] = b.id));
  if (handle) first.handle = handle;
  (shell ?? []).forEach((b, i) => (first[`shell-${i + 1}`] = b.id));
  guides.forEach((g, i) => (first[`guide-${i + 1}`] = g));
  nameAll(d, role, first);
}

/** The largest corner radius a roll-top box's height and depth take (the door's runs between its corners). */
export function maxRadius(roll: Roll, D: number, H: number): number {
  return Math.max(10, Math.floor(Math.min(roll === 'two' ? (D - 30) / 2 : D - 40, (H - 30) / 2)));
}

export const rollTop: TemplateDef = {
  id: 'rollTop',
  version: 1,
  status: 'beta',
  name: 'sen.rollTop',
  description: 'sen.rollTop.desc',
  word: 'sen.rollTop',
  materials: ['plywood'],
  canMake: plywoodOnly,
  fallback: () => 'box',
  params: [
    num('width', 'sen.width', 60, 300, 100),
    num('depth', 'sen.depth', 90, 300, 150),
    num('height', 'sen.height', 90, 300, 100),
    num('radius', 'sen.rollRadius', 25, 120, 30),
    {
      key: 'roll', label: 'sen.roll', type: 'choice', default: 'one',
      options: (['one', 'two', 'bread'] as const).map((v) => ({ value: v, label: `sen.roll.${v}` as MsgKey })),
      allowed: (v, p, m) => cleanWith(rollTop, m, p, 'roll', v),
      why: () => 'sen.why.rollRoom',
    },
  ],
  generate: generateRollTop,
  sentence: { main: 'sen.s.rollTop' },
};
rollTop.limits = (m, p) => {
  const out = sheetLimits(rollTop, { width: 60, depth: 90, height: 90 })(m, p);
  const roll = (p.roll ?? 'one') as Roll;
  Object.defineProperty(out, 'radius', { enumerable: true, value: { min: Math.min(maxRadius(roll, Number(p.depth), Number(p.height)), minRadius(m.thickness, m.clearance, Number(p.width))), max: maxRadius(roll, Number(p.depth), Number(p.height)), why: 'sen.why.rollRadius' as MsgKey } });
  return out;
};
rollTop.accepts = (m, p) => {
  const roll = (p.roll ?? 'one') as Roll;
  const L = rollLayout(roll, Number(p.width), Number(p.depth), Number(p.height), Math.min(Number(p.radius), maxRadius(roll, Number(p.depth), Number(p.height))), m.thickness, m.clearance);
  if ('why' in L) return L.why;
  if (Number(p.radius) < minRadius(m.thickness, m.clearance, Number(p.width)) - 1e-6) return 'sen.why.rollRadius';
  return cleanAll(rollTop, m, p) ? null : 'sen.why.engineSize';
};

/**
 * The tightest corner a roll-top box's door and shell bend round in this plywood (the outline's radius, mm): the
 * door's band is t + play + t inside it, the shell's t + play further in, and each must be as loose as plywood's
 * slits reach across its width.
 */
export function minRadius(t: number, clearance: number, W: number): number {
  const play = slidePlay(t, clearance);
  const m = { kind: 'plywood', thickness: t, clearance } as never;
  const d = { material: m } as unknown as Design;
  const door = stripReach(d, W - 2 * t - 2 * play), shell = stripReach(d, W - 2 * t);
  return Math.ceil(Math.max(door + 2 * t + play, shell + 3 * t + 2 * play));
}

void legAt;
export type { StripBoard };
