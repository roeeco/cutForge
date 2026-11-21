// Presets built from boards (milestones 161–170, BOXES_PRESETS_PLAN.md): rigid boards joined at their edges, for
// plywood and 4 mm corrugated, after constructions read in boxes.py (a behaviour reference only: THIRD_PARTY.md).
// This file is the kit they share: which boards make them, a box whose walls are boards of their own, and the
// joint census the tests hold them to.
import type { ConnectionKind, Design, MaterialProfile, P2, V3 } from '../../model/types';
import { boxRecipe, type Footprint } from '../../easy/recipes';
import { addDetail, addFreePanel, addPathShape, laminateBoards, setTrayKinds, solve } from '../../model/ops';
import { toWorld } from '../../model/frame';
import { builtFor, cleanWith, mainTray } from './box';
import type { ParamDef, Params, TemplateDef } from '../types';

/**
 * The boards a board-built preset is made of (owner, 21 November): plywood, and corrugated of 3 mm or more. Card and
 * thin corrugated are left off: what they make of the same thing is folded, and the folded presets are their own.
 */
export const boardStock = (m: MaterialProfile) => m.kind === 'plywood' || (m.kind === 'corrugated' && m.thickness >= 3 - 1e-9);


/**
 * Plywood only: a board-built preset whose 4 mm board version the engine does not build clean yet (a bird house's
 * roof: on 4 mm board every wall stands inset on the base's face, and a roof grown off a gable meets the walls beside
 * it). Listed in DECISIONS.md with each preset that uses it.
 */
export const plywoodOnly = (m: MaterialProfile) => m.kind === 'plywood';

/**
 * A box of boards (R4): on plywood its walls are fingered to the base and to each other, as any plywood box; on
 * corrugated they are boards of their own, held to the base and to each other by tabs through slots, not folded up
 * from the base. Returns the box's tray, or null.
 */
export function boardBox(d: Design, f: Footprint, height: number): string | null {
  if (!boxRecipe(d, f, height, 'open')) return null;
  solve(d);
  const tr = mainTray(d);
  if (!tr) return null;
  if (d.material.kind === 'corrugated') setTrayKinds(d, tr, { wallKind: 'tabslot', cornerKind: 'tabslot' });
  solve(d);
  return tr;
}

/** A box of boards on a rectangle W × D centred on the origin. */
export const boardBoxRect = (d: Design, W: number, D: number, H: number) => boardBox(d, { kind: 'rect', x0: -W / 2, z0: -D / 2, x1: W / 2, z1: D / 2 }, H);

/**
 * The joint census (milestone 161, BOXES_PRESETS_PLAN.md §8): what a board-built preset may not have. On corrugated
 * no board is folded off another and none is fingered (the owner, 21 November: tabs in slots on 4 mm board); on
 * plywood nothing is held by a flap (plywood does not fold, so a glue flap or a lock cannot be made; a plywood fold
 * is a living hinge, which may stay). Returns each joint that breaks it, as `kind@id`.
 */
export function censusBreaks(d: Design): string[] {
  const out: string[] = [];
  const corr = d.material.kind === 'corrugated';
  for (const c of Object.values(d.connections)) {
    const k: ConnectionKind = c.kind;
    if (corr && (k === 'fold' || k === 'finger')) out.push(`${k}@${c.id}`);
    if (!corr && (k === 'glue' || k === 'lock')) out.push(`${k}@${c.id}`);
  }
  return out;
}

/**
 * A keyhole's outline (milestone 171, BOXES_PLYWOOD_PLAN.md E0): a round hole a screw head passes through and a slot
 * above it as wide as the screw's shank, round at its top, so the board drops onto the screw. As one polygon in a unit
 * box, with that box's size and where the head's centre is in it (from the box's centre, mm).
 */
export function keyholeShape(head = 9, shank = 4.5, rise = 10): { polys: { x: number; y: number }[][]; w: number; h: number; head: { x: number; y: number } } {
  const R = head / 2, s = shank / 2;
  const join = Math.asin(s / R);
  const pts: { x: number; y: number }[] = [];
  // up the slot's right side, over its round top, down its left side, then round the head the long way
  pts.push({ x: s, y: R * Math.cos(join) }, { x: s, y: rise });
  for (let i = 1; i < 12; i++) {
    const a = (Math.PI * i) / 12;
    pts.push({ x: s * Math.cos(a), y: rise + s * Math.sin(a) });
  }
  pts.push({ x: -s, y: rise }, { x: -s, y: R * Math.cos(join) });
  const a0 = Math.PI / 2 + join, a1 = Math.PI * 2.5 - join;
  for (let i = 1; i < 24; i++) {
    const a = a0 + ((a1 - a0) * i) / 24;
    pts.push({ x: R * Math.cos(a), y: R * Math.sin(a) });
  }
  const y0 = -R, y1 = rise + s, w = 2 * R, h = y1 - y0, cy = (y0 + y1) / 2;
  return { polys: [pts.map((q) => ({ x: q.x / w, y: (q.y - cy) / h }))], w, h, head: { x: 0, y: -cy } };
}

/**
 * Two keyholes near a board's top edge (or `below` it, mm), an eighth of its width in from each end (milestone 171), each marked as a
 * hole to hang by (`mount`), so the record knows the thing hangs. Its slot points up the board (+y).
 */
export function hangByKeyholes(d: Design, panelId: string, below?: number): string[] {
  const p = d.panels[panelId];
  if (!p) return [];
  const t = d.material.thickness;
  const k = keyholeShape(Math.max(8, Math.min(10, 2 * t + 3)));
  // the slot's top clear of the board's top edge by a web of two boards (never under 6 mm), or as far as asked
  const cy = p.h - (below ?? Math.max(6, 2 * t)) - k.h / 2;
  const out: string[] = [];
  for (const x of [p.w * 0.125, p.w * 0.875]) {
    const id = addPathShape(d, panelId, k.polys, x, cy, k.w, k.h, 'cut');
    if (!id) continue;
    const dt = p.details.find((z) => z.id === id)!;
    dt.mount = 'keyhole';
    out.push(id);
  }
  return out;
}


// --- hanging by a cleat (milestone 179, BOXES_PLYWOOD_PLAN.md §3.3) ---

/**
 * A stepped cleat's sizes on board `t` thick (mm): the glue band each layer shares with the next (`band`), how far the
 * hook drops behind the wall cleat's front layer (`drop`), and the play round it (`play`).
 */
export const cleatSizes = (t: number) => ({ band: Math.max(20, 4 * t), drop: Math.max(12, 3 * t), play: Math.max(0.5, t / 6) });

/** Where a cleat goes on a back, in mm from its edges (the caller keeps them clear of the back's slots). */
export type CleatAt = {
  /** The item cleat's top this far below the back's top edge (default: a web of two boards, never under 6 mm). */
  below?: number;
  /** Its ends this far in from the back's ends (default: clear of a corner's fingers). */
  inset?: number;
  /** The stand-off's foot this far above the back's bottom edge, its height, and its span across from the back's left end. */
  stud?: { y: number; h?: number; x0: number; x1: number };
};

/** The height a cleat takes at a back's top: its band, its drop and the wall cleat below it, lifted (mm). */
export const cleatDepth = (t: number) => {
  const c = cleatSizes(t);
  return 2 * c.band + 3 * c.drop + 4 * c.play;
};

const rectP = (w: number, h: number): P2[] => [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];

/**
 * Hang an upright board (a thing's back, facing +z, the wall behind it at −z) by a stepped cleat (milestone 179). A
 * laser cuts square, so boxes.py's bevelled French cleat becomes two steps of plywood glued face to face (`laminate`):
 * on the back's rear face near its top a spacer and, behind it, a hook layer reaching `drop` lower; on the wall a cleat
 * of the same two boards turned over, its front layer reaching `drop` higher than its back one. The hook drops into the
 * gap between the wall and the wall cleat's front layer: the thing's weight pulls its top away from the wall and the
 * front layer holds the hook in. A stand-off of two layers at the back's foot keeps it upright against the wall. The
 * wall cleat is drawn a hook's drop lower than where it holds, as when the thing is lifted onto it, so nothing touches
 * in 3D. Every board is marked (`Panel.cleat`); returns them with their names, or [] when the back has no room.
 */
export function hangByCleat(d: Design, panelId: string, at: CleatAt = {}): { name: string; id: string }[] {
  const p = d.panels[panelId];
  if (!p) return [];
  const t = d.material.thickness;
  const { band: s, drop: g, play: e } = cleatSizes(t);
  // the back's box in the world: its rear face (the smaller z), its ends and its top and foot
  const pts: V3[] = [];
  for (const x of [0, p.w]) for (const y of [0, p.h]) for (const z of [0, t]) pts.push(toWorld(p.frame, x, y, z));
  const zr = Math.min(...pts.map((q) => q[2])), x0 = Math.min(...pts.map((q) => q[0])), x1 = Math.max(...pts.map((q) => q[0]));
  const yb = Math.min(...pts.map((q) => q[1])), yt = Math.max(...pts.map((q) => q[1]));
  if (Math.max(...pts.map((q) => q[2])) - zr > t + 0.01) return [];
  const inset = at.inset ?? Math.max(2 * t, 6) + t + 1;
  const xa = x0 + inset, L = x1 - x0 - 2 * inset;
  const yc = yt - (at.below ?? Math.max(6, 2 * t)) - s;
  const lift = g + 2 * e;
  const wall0 = yc - e - s - g - lift;
  const stud = at.stud ?? { y: 2 * t + 2, x0: (x1 - x0) * 0.25, x1: (x1 - x0) * 0.75 };
  const sh = stud.h ?? Math.min(s, Math.max(6, wall0 - yb - stud.y - 4));
  if (L < 30 || sh < 5 || yb + stud.y + sh > wall0 - 2) return [];
  const across = (x: number, y: number, z: number, w: number, h: number) => addFreePanel(d, { frame: { o: [x, y, z], u: [1, 0, 0], v: [0, 1, 0] }, side: 1, outer: rectP(w, h) });
  const made: { name: string; id: string | null; kind: 'item' | 'wall' }[] = [
    { name: 'cleat-1', id: across(xa, yc, zr - t, L, s), kind: 'item' },
    { name: 'cleat-2', id: across(xa, yc - g, zr - 2 * t, L, s + g), kind: 'item' },
    { name: 'stud-1', id: across(x0 + stud.x0, yb + stud.y, zr - t, stud.x1 - stud.x0, sh), kind: 'item' },
    { name: 'stud-2', id: across(x0 + stud.x0, yb + stud.y, zr - 2 * t, stud.x1 - stud.x0, sh), kind: 'item' },
    // the wall cleat: its front layer the hook's drop taller than its back one, a play off the thing's back
    { name: 'wall-cleat-1', id: across(xa, wall0, zr - t - e, L, s + g), kind: 'wall' },
    { name: 'wall-cleat-2', id: across(xa, wall0, zr - 2 * t - e, L, s), kind: 'wall' },
  ];
  if (made.some((m) => !m.id)) return [];
  const id = (k: number) => made[k].id!;
  for (const m of made) d.panels[m.id!].cleat = m.kind;
  laminateBoards(d, id(0), panelId);
  laminateBoards(d, id(1), id(0));
  laminateBoards(d, id(2), panelId);
  laminateBoards(d, id(3), id(2));
  laminateBoards(d, id(4), id(5));
  // two screws through the wall cleat, through both layers where they are glued
  for (const k of [4, 5]) for (const x of [L * 0.125, L * 0.875]) addDetail(d, id(k), 'circle', 'cut', x, s / 2, 4.5, 4.5);
  solve(d);
  return made.map((m) => ({ name: m.name, id: m.id! }));
}

/** How a thing hangs on a wall (milestone 179): by screws through keyholes, or on a cleat. A design saved before 179 hangs by keyholes. */
export const hangBy = (v: unknown): 'keyholes' | 'cleat' => (v === 'cleat' ? 'cleat' : 'keyholes');

/**
 * The word *hang by* on a wall card (milestone 179): screws through keyholes (the default, so a design saved before
 * 179 builds as it did) or a cleat. Plywood only; refused where the back has no room for the cleat.
 */
export const hangWord = (def: () => TemplateDef): ParamDef => ({
  key: 'hang', label: 'sen.hang', type: 'choice', default: 'keyholes', addon: { off: 'keyholes' },
  options: [{ value: 'keyholes', label: 'sen.hang.keyholes' }, { value: 'cleat', label: 'sen.hang.cleat' }],
  allowed: (v, p, m) => v !== 'cleat' || cleatFits(def(), m, p),
  why: (_v, _p, m) => (m.kind !== 'plywood' ? 'sen.why.plyOnly' : 'sen.why.cleatRoom'),
});

/** Does a cleat fit on this thing (plywood, built clean, the cleat's boards made)? `key` is its word, `on` the word's value for a cleat. */
export function cleatFits(def: TemplateDef, m: MaterialProfile, p: Params, key = 'hang', on = 'cleat'): boolean {
  if (m.kind !== 'plywood' || !cleanWith(def, m, p, key, on)) return false;
  const q: Params = { ...p, [key]: on };
  const i = def.params.findIndex((x) => x.key === key);
  for (const x of def.params.slice(i + 1)) if (x.addon) q[x.key] = x.addon.off;
  const d = builtFor(def, m, q);
  return d.order.some((id) => d.panels[id].cleat);
}

/** Hang a thing's back the way its words say: keyholes `below` its top, or a cleat placed as `at` says. Returns the cleat's boards. */
export function hangThing(d: Design, p: Params, back: string, below?: number, at: CleatAt = {}): { name: string; id: string }[] {
  if (hangBy(p.hang) === 'cleat') return hangByCleat(d, back, at);
  hangByKeyholes(d, back, below);
  return [];
}
