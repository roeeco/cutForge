// Presets built from boards (milestones 161–170, BOXES_PRESETS_PLAN.md): rigid boards joined at their edges, for
// plywood and 4 mm corrugated, after constructions read in boxes.py (a behaviour reference only: THIRD_PARTY.md).
// This file is the kit they share: which boards make them, a box whose walls are boards of their own, and the
// joint census the tests hold them to.
import type { ConnectionKind, Design, MaterialProfile } from '../../model/types';
import { boxRecipe, type Footprint } from '../../easy/recipes';
import { setTrayKinds, solve } from '../../model/ops';
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
