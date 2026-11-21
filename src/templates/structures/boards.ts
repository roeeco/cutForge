// Presets built from boards (milestones 161–170, BOXES_PRESETS_PLAN.md): rigid boards joined at their edges, for
// plywood and 4 mm corrugated, after constructions read in boxes.py (a behaviour reference only: THIRD_PARTY.md).
// This file is the kit they share: which boards make them, a box whose walls are boards of their own, and the
// joint census the tests hold them to.
import type { ConnectionKind, Design, MaterialProfile } from '../../model/types';
import { boxRecipe, type Footprint } from '../../easy/recipes';
import { addPathShape, setTrayKinds, solve } from '../../model/ops';
import { mainTray } from './box';

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
