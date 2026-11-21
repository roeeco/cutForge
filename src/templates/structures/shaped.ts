// Milestone 157 (PRESETS_OVERHAUL.md §7): three presets that needed the engine to do something new, all beta.
//   a magazine file  a box whose front is low and whose side walls slope down to it: a wall outline that is not a
//                    rectangle, keeping its joints (corrugated re-finds the corner seams its front's fold moved);
//   a dice tower     a tall box with boards set at a slant between its side walls, joined to them at that angle, and
//                    a way out at the bottom of the front;
//   a mailer         one wrap (model/builders.ts): front, base with its side walls, back, a lid as deep as the inside
//                    and a tuck that goes in behind the front, between the side walls.
// The spikes and what they found are in DECISIONS.md (milestone 157).
import type { ConnectionKind, Design, MaterialProfile, V3 } from '../../model/types';
import type { MsgKey } from '../../i18n';
import type { ParamDef, Params, TemplateDef } from '../types';
import { boxRecipe, holeRecipe } from '../../easy/recipes';
import { trayRing } from '../../model/cartons';
import { addFreePanel, connectSeams, deleteConnection, growPanel, setCustomHeight, setPanelSize, setTrayKinds, setWallCorner, solve } from '../../model/ops';
import { addWrap } from '../../model/builders';
import { foldsAsCarton } from '../../model/materials';
import { cleanAll, cleanWith, mainTray } from './box';
import { largestOk } from '../../sentence/resolve';
import type { Limit } from '../types';

type Role = (name: string, id: string) => void;
const num = (key: string, label: MsgKey, min: number, max: number, dflt: number): ParamDef => ({ key, label, type: 'number', unit: 'mm', min, max, default: dflt });

/** Every board its role: a box's base and walls as a box's, the rest `part-n`. */
export function nameAll(d: Design, role: Role, first: Record<string, string> = {}) {
  const named = new Set<string>();
  const name = (n: string, id: string | undefined) => {
    if (!id || named.has(id) || !d.panels[id]) return;
    named.add(id);
    role(n, id);
  };
  for (const [n, id] of Object.entries(first)) name(n, id);
  for (const t of Object.values(d.trays ?? {})) {
    name('base', t.baseId);
    for (const r of trayRing(d, t)) name(`wall-${r.edge}`, r.wall);
  }
  let k = 0;
  for (const id of d.order) if (!named.has(id)) name(`part-${++k}`, id);
}

/** A box's walls by base edge (e0 the front, e2 the back). */
export function wallsOf(d: Design): Record<string, string> {
  const tr = mainTray(d);
  const t = tr ? d.trays[tr] : undefined;
  return t ? Object.fromEntries(trayRing(d, t).map((r) => [r.edge, r.wall])) : {};
}

/**
 * Corner joints a change of walls made stale, found again: in corrugated a wall made smaller can fold off the base
 * again (the flat net's plan) and so moves out to the base's edge, away from the corner seam it had.
 */
export function reseam(d: Design, kind: ConnectionKind) {
  for (let pass = 0; pass < 3; pass++) {
    solve(d);
    const stale = Object.values(d.connections).filter((c) => !c.grown && c.broken && c.trayId);
    if (!stale.length) return;
    const walls = new Set(stale.flatMap((c) => [c.a.panelId, c.b.panelId]));
    for (const c of stale) deleteConnection(d, c.id);
    solve(d);
    for (const w of walls) connectSeams(d, w, kind);
  }
  solve(d);
}

/**
 * Each size's largest that still cuts clean (a net that lies on one sheet), found by bisection from a size known to
 * be clean (as the drawer's, drawer.ts).
 */
export function sheetLimits(def: TemplateDef, lows: Record<string, number>): NonNullable<TemplateDef['limits']> {
  return (m, p) => {
    const out: Record<string, Limit> = {};
    for (const key of Object.keys(lows))
      Object.defineProperty(out, key, {
        enumerable: true,
        get: () => {
          const own = def.params.find((x) => x.key === key) as Extract<ParamDef, { max: number }>;
          const ck = JSON.stringify([def.id, m, { ...p, [key]: null }, key]);
          const v = largestOk(ck, Math.max(own.min, lows[key]), own.max, (x) => cleanWith(def, m, { ...p, [key]: x }, key, x), 9, 0.5);
          return { max: Math.max(own.min, v), why: 'sen.why.sheet' as MsgKey };
        },
      });
    return out;
  };
}

// --- the magazine file ---

/** Milestone 178: the uneven file's right side at the back, never above its left. */
const unevenLow = (p: Params) => Math.min(Number(p.low ?? 160), Number(p.height) - 10);
/** Room for it: the right side 10 mm or more below the left, and its front corner 25 mm tall or more. */
const unevenRoom = (p: Params) => Number(p.low) <= Number(p.height) - 10 && (Math.min(Number(p.front), Number(p.height) - 10) * unevenLow(p)) / Number(p.height) >= 25;

function generateMagazineFile(d: Design, p: Params, role: Role) {
  const W = Number(p.width), D = Number(p.depth), H = Number(p.height);
  const F = Math.min(Number(p.front), H - 10);
  if (!boxRecipe(d, { kind: 'rect', x0: -W / 2, z0: -D / 2, x1: W / 2, z1: D / 2 }, H, 'open')) return;
  solve(d);
  const tr = mainTray(d)!;
  // corrugated: glued corners (a tab and slot has no room by the sloped edge's foot)
  if (d.material.kind === 'corrugated') setTrayKinds(d, tr, { cornerKind: 'glue' });
  const w = wallsOf(d);
  // the side walls slope down to the front: their top corner by the front lowered (e1 runs from the front, e3 to it)
  if (w.e1) setWallCorner(d, w.e1, 'tl', { dx: 0, dy: -(H - F) });
  if (w.e3) setWallCorner(d, w.e3, 'tr', { dx: 0, dy: -(H - F) });
  if (w.e0) {
    setCustomHeight(d, w.e0, true);
    setPanelSize(d, w.e0, undefined, F);
  }
  // milestone 178 (boxes.py's UnevenHeightBox, plywood): the right side lower, its back corner at `low` and its front
  // in proportion, so the top slopes across as well as down to the front: the back and front lowered on that side
  if (p.uneven === 'uneven') {
    const L = unevenLow(p);
    const fr = (F * L) / H;
    if (w.e1) setWallCorner(d, w.e1, 'tr', { dx: 0, dy: -(H - L) });
    if (w.e1) setWallCorner(d, w.e1, 'tl', { dx: 0, dy: -(H - fr) });
    // the back (e2) runs from the right to the left: its first top corner is on the right; the front (e0) from the left
    if (w.e2) setWallCorner(d, w.e2, 'tl', { dx: 0, dy: -(H - L) });
    if (w.e0) setWallCorner(d, w.e0, 'tr', { dx: 0, dy: -(F - fr) });
  }
  reseam(d, d.trays[tr].cornerKind);
  // a finger pull at the top of the back (a slot, not a window)
  const back = w.e2 && d.panels[w.e2];
  if (back && back.w > 50) holeRecipe(d, back.id, 'roundrect', back.w / 2, back.h - 18, Math.min(40, back.w - 30), 16);
  solve(d);
  nameAll(d, role);
}

export const magazineFile: TemplateDef = {
  id: 'magazineFile',
  version: 1,
  name: 'sen.magazineFile',
  description: 'sen.magazineFile.desc',
  word: 'sen.magazineFile',
  status: 'beta',
  materials: ['card', 'corrugated', 'plywood'],
  fallback: () => 'box',
  params: [
    num('width', 'sen.width', 40, 150, 80),
    num('depth', 'sen.depth', 100, 300, 200),
    num('height', 'sen.height', 120, 300, 240),
    num('front', 'sen.frontHeight', 40, 200, 80),
    // milestone 178 (BOXES_PLYWOOD_PLAN.md §3.2, boxes.py's UnevenHeightBox): a height per corner, on plywood
    {
      key: 'uneven', label: 'sen.uneven', type: 'choice', default: 'level', addon: { off: 'level' },
      options: [{ value: 'level', label: 'sen.uneven.level' }, { value: 'uneven', label: 'sen.uneven.uneven' }],
      allowed: (v, p, m) => v === 'level' || (m.kind === 'plywood' && unevenRoom(p) && cleanWith(magazineFile, m, p, 'uneven', v)),
      why: (_v, p, m) => (m.kind !== 'plywood' ? 'sen.why.plyOnly' : !unevenRoom(p) ? 'sen.why.unevenRoom' : 'sen.why.engine'),
      affects: ['walls'],
    },
    { key: 'low', label: 'sen.lowCorner', type: 'number', unit: 'mm', min: 40, max: 290, default: 160, when: (p) => p.uneven === 'uneven' },
  ],
  generate: generateMagazineFile,
  sentence: { main: 'sen.s.magazineFile' },
};
magazineFile.limits = sheetLimits(magazineFile, { width: 40, depth: 100, height: 120 });
magazineFile.accepts = (m, p) => (Number(p.front) < Number(p.height) - 20 && cleanAll(magazineFile, m, p) ? null : 'sen.why.engineSize');

// --- the dice tower ---

/** The slant of a baffle (degrees from level): steep enough that a die rolls on, low enough that it bounces; less when the tower is short, never under the least. */
const BAFFLE_SLANT = 35;
const BAFFLE_LEAST = 20;
/** How far across a baffle reaches (of the inside, front to back); the ramp at the bottom reaches all the way. */
const BAFFLE_REACH = 0.68;

/**
 * The baffles' layout in a tower `H` tall whose inside runs `run` front to back: the ramp's foot (above the base by a
 * web clear of the front's joint with it), the slant's tangent (35°, less when that does not fit) and the room between
 * one baffle's low end and the next one's top. Null when even at the least slant they do not fit.
 */
function baffleLayout(H: number, run: number, n: number, t: number): { foot: number; top: number; s: number; gap: number } | null {
  const foot = 3 * t + 4, top = H - 15, gap = 8 + t;
  // stacked one under another: the ramp's drop, each other baffle's drop and a gap under each of them
  const s = Math.min(Math.tan((BAFFLE_SLANT * Math.PI) / 180), (top - foot - (n - 1) * gap) / (run * (1 + BAFFLE_REACH * (n - 1))));
  return s >= Math.tan((BAFFLE_LEAST * Math.PI) / 180) ? { foot, top, s, gap } : null;
}

/** The most baffles a tower of these words has room for (2 to 4). */
function mostBaffles(m: MaterialProfile, p: Params): number {
  const t = m.thickness, run = Number(p.depth) - 2 * t;
  for (let n = 4; n > 2; n--) if (baffleLayout(Number(p.height), run, n, t)) return n;
  return 2;
}

/** Where a wall's inner face is along one axis (0 x, 2 z): of its two faces, the one nearer the box's middle. */
export function innerFace(d: Design, wallId: string | undefined, axis: 0 | 2): number | null {
  const P = wallId ? d.panels[wallId] : undefined;
  if (!P) return null;
  const { o, u, v, side } = P.frame;
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const a = o[axis], b = o[axis] + n[axis] * side * d.material.thickness;
  return Math.abs(a) < Math.abs(b) ? a : b;
}

function generateDiceTower(d: Design, p: Params, role: Role) {
  const W = Number(p.width), D = Number(p.depth), H = Number(p.height);
  const n = Math.max(2, Math.min(mostBaffles(d.material, p), Math.round(Number(p.baffles))));
  if (!boxRecipe(d, { kind: 'rect', x0: -W / 2, z0: -D / 2, x1: W / 2, z1: D / 2 }, H, 'open')) return;
  solve(d);
  const t = d.material.thickness;
  const w = wallsOf(d);
  // between the walls' inner faces, as built (a tab-and-slot wall stands in from the base's edge, a folded one not)
  const xL = innerFace(d, w.e3, 0) ?? -W / 2 + t, xR = innerFace(d, w.e1, 0) ?? W / 2 - t;
  const zB = innerFace(d, w.e2, 2) ?? -D / 2 + t, zF = innerFace(d, w.e0, 2) ?? D / 2 - t;
  const inner = xR - xL, run = zF - zB;
  const lay = baffleLayout(H, run, n, t) ?? { foot: 3 * t + 4, top: H - 15, s: Math.tan((BAFFLE_LEAST * Math.PI) / 180), gap: 8 + t };
  const { foot, top, s } = lay;
  const a = Math.atan(s);
  // the way out, above the ramp's foot
  const exitH = Math.min(36, H / 4);
  const front = w.e0 && d.panels[w.e0];
  if (front) holeRecipe(d, front.id, 'rect', front.w / 2, foot - t + exitH / 2, Math.max(10, front.w - 6 * t - 10), exitH);
  // baffles from the top down: each from the back or the front, two thirds across; the last the ramp, all the way to the way out.
  // The ones above the ramp are spread evenly between the top and the ramp, each a gap above the next.
  const rampTop = foot + run * s, drop = BAFFLE_REACH * run * s;
  const lowest = rampTop + lay.gap + drop;
  const step = n > 2 ? (top - lowest) / (n - 2) : 0;
  const baffles: string[] = [];
  for (let i = 0; i < n; i++) {
    const ramp = i === n - 1;
    // the ramp comes off the back; the ones above it turn about, so the last above the ramp comes off the front
    const from = (n - 1 - i) % 2 === 0 ? -1 : 1;
    const len = (ramp ? run : run * BAFFLE_REACH) / Math.cos(a);
    const y = ramp ? rampTop : n > 2 ? top - step * i : lowest + (top - lowest) / 2;
    const v: V3 = [0, -Math.sin(a), -from * Math.cos(a)];
    const id = addFreePanel(d, { frame: { o: [xL, y, from < 0 ? zB : zF], u: [1, 0, 0], v }, side: 1, outer: [{ x: 0, y: 0 }, { x: inner, y: 0 }, { x: inner, y: len }, { x: 0, y: len }] });
    if (id) baffles.push(id);
  }
  solve(d);
  for (const b of baffles) connectSeams(d, b);
  solve(d);
  nameAll(d, role, Object.fromEntries(baffles.map((b, i) => [`baffle-${i + 1}`, b])));
}

export const diceTower: TemplateDef = {
  id: 'diceTower',
  version: 1,
  name: 'sen.diceTower',
  description: 'sen.diceTower.desc',
  word: 'sen.diceTower',
  status: 'beta',
  materials: ['card', 'corrugated', 'plywood'],
  fallback: () => 'box',
  params: [
    num('width', 'sen.width', 50, 120, 70),
    num('depth', 'sen.depth', 50, 120, 70),
    num('height', 'sen.height', 120, 300, 170),
    { key: 'baffles', label: 'sen.baffles', type: 'int', min: 2, max: 4, default: 3 },
  ],
  generate: generateDiceTower,
  sentence: { main: 'sen.s.diceTower' },
};
// as many baffles as there is room for (a short, deep tower has fewer)
diceTower.limits = (m, p) => ({ baffles: { max: mostBaffles(m, p), why: 'sen.why.baffleRoom' as MsgKey } });
diceTower.accepts = (m, p) => (cleanAll(diceTower, m, p) ? null : 'sen.why.engineSize');

// --- the mailer ---

const folds = (m: MaterialProfile) => foldsAsCarton(m, 4);

function generateMailer(d: Design, p: Params, role: Role) {
  const L = Number(p.width), D = Number(p.depth), H = Number(p.height);
  const t = d.material.thickness, cl = d.material.clearance;
  // the lid as deep as the inside, less the clearance, so its tuck stands just behind the front
  const w = addWrap(d, { length: L, root: 1, sections: [{ depth: H, bend: 90 }, { depth: D, bend: 90, flanges: H }, { depth: H, bend: 90 }, { depth: D - 2 * t - cl, bend: 90 }] });
  if (!w) return;
  const [front, base, back, lid] = w.sections;
  // the tuck: between the side walls, a little shorter than the front
  const tuck = growPanel(d, lid, 'e2', { height: Math.max(10, Math.min(H - 8, 30)), angle: 90, dir: 'up', kind: 'fold', span: [t + cl + 1, L - t - cl - 1] });
  solve(d);
  nameAll(d, role, { front, base, back, lid, ...(tuck ? { tuck: tuck.panelId } : {}), ...Object.fromEntries(w.flanges.map((f, i) => [`side-${i + 1}`, f])) });
}

export const mailer: TemplateDef = {
  id: 'mailer',
  version: 1,
  name: 'sen.mailer',
  description: 'sen.mailer.desc',
  word: 'sen.mailer',
  status: 'beta',
  materials: ['card', 'corrugated'],
  canMake: folds,
  fallback: () => 'box',
  fallbackWords: { lid: 'hinged' },
  params: [
    num('width', 'sen.width', 60, 300, 160),
    num('depth', 'sen.depth', 40, 250, 110),
    num('height', 'sen.height', 20, 120, 45),
  ],
  generate: generateMailer,
  sentence: { main: 'sen.s.mailer' },
};
mailer.limits = sheetLimits(mailer, { width: 60, depth: 40, height: 20 });
mailer.accepts = (m, p) => (cleanAll(mailer, m, p) ? null : 'sen.why.engineSize');
