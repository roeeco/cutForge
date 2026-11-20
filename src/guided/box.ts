// Guided's box (milestone 107, GUIDED_MODE.md G4): what Build changes, as pure functions on a design.
// Sizes are always the inside (one meaning of inside, milestone 93); dividers are milestone 70's.
import type { Design, P2 } from '../model/types';
import { boxSize, setBoxSize, statedBoxes, type BoxDims } from '../model/boxSize';
import { compartments, type Compartment } from '../easy/objects';
import { boxLid, lidParts, lidWhy, setBoxLid, type LidChoice } from '../easy/lid';
import { dividerLine, planDividerLine } from '../easy/recipes';
import { dividerRow, dividersOn, isDivider } from '../model/dividers';
import { deletePanel, setDividerOffset } from '../model/ops';

/** The smallest space a split leaves on either side (mm). */
export const GUIDED_MIN_SPACE = 20;
/** Templates Guided shows as sliders (the stand; a saved version-1 organiser). */
export const SLIDER_TEMPLATES = ['stand', 'organiser'];

/**
 * What Build can change: `'box'` (one box with its walls, dividers and lid, and nothing else),
 * `'template'` (a thing made from a template's sizes: the card stand, a version-1 organiser) or
 * `'more'` (anything else, made with more tools: it is decorated and sent, not resized).
 */
export function kindOf(d: Design): 'box' | 'template' | 'solid' | 'more' {
  // a ready shape (milestone 128): its few sizes
  if (d.make?.solid) return 'solid';
  if (d.template && SLIDER_TEMPLATES.includes(d.template.id)) return 'template';
  const boxes = statedBoxes(d);
  if (boxes.length !== 1) return 'more';
  const tray = boxes[0];
  const mine = new Set<string>([tray.baseId, ...dividersOn(d, tray.baseId), ...lidParts(d, boxLid(d, tray.id))]);
  for (const t of Object.values(d.trays ?? {})) if (t.id === tray.id || t.lidOf) mine.add(t.baseId);
  for (const c of Object.values(d.connections)) if (c.grown && c.trayId && d.trays?.[c.trayId] && (c.trayId === tray.id || d.trays[c.trayId].lidOf)) mine.add(c.b.panelId);
  return d.order.every((id) => mine.has(id)) ? 'box' : 'more';
}

/** The box Build changes (its tray id), or null: the first tray that is not a lid (as the structures' `mainTray`). */
export const boxTrayOf = (d: Design): string | null => Object.values(d.trays ?? {}).find((t) => !t.lidOf)?.id ?? null;

export function insideSize(d: Design): BoxDims | null {
  const t = boxTrayOf(d);
  return t ? boxSize(d, t, 'inside') : null;
}

/** Set the clear inside (any of the three); dividers keep their distance from the left and the front. */
export function setInsideSize(d: Design, s: Partial<BoxDims>) {
  const t = boxTrayOf(d);
  if (t) setBoxSize(d, t, s, 'inside');
}

/** The box's spaces, in the order `compartments` gives (front to back, then left to right). */
export function spaces(d: Design): Compartment[] {
  const t = boxTrayOf(d);
  const base = t && d.trays?.[t]?.baseId;
  return base ? compartments(d, base) : [];
}

export type SplitDir = 'sideToSide' | 'frontToBack';

/** The divider line that splits a space through its middle: side to side runs along x (a front and a back half). */
function splitLine(k: Compartment, dir: SplitDir): [P2, P2] {
  const cx = (k.x0 + k.x1) / 2, cy = (k.y0 + k.y1) / 2;
  return dir === 'sideToSide' ? [{ x: k.x0 + 1, y: cy }, { x: k.x1 - 1, y: cy }] : [{ x: cx, y: k.y0 + 1 }, { x: cx, y: k.y1 - 1 }];
}

/** Can a space be split this way: both halves at least `GUIDED_MIN_SPACE`, and a divider fits there? */
export function canSplit(d: Design, k: Compartment, dir: SplitDir): boolean {
  const t = d.material.thickness;
  const L = dir === 'sideToSide' ? k.y1 - k.y0 : k.x1 - k.x0;
  if ((L - t) / 2 < GUIDED_MIN_SPACE) return false;
  const [a, b] = splitLine(k, dir);
  return planDividerLine(d, k.baseId, a, b)?.kind === 'divider';
}

/** Split a space through its middle; the divider ends on the walls or dividers around it. Returns the divider's id. */
export function splitSpace(d: Design, k: Compartment, dir: SplitDir): string | null {
  if (!canSplit(d, k, dir)) return null;
  const [a, b] = splitLine(k, dir);
  return dividerLine(d, k.baseId, a, b)?.id ?? null;
}

/** The largest space, the one *Divider* splits when none is selected. */
export function largestSpace(d: Design): Compartment | null {
  return [...spaces(d)].sort((a, b) => (b.x1 - b.x0) * (b.y1 - b.y0) - (a.x1 - a.x0) * (a.y1 - a.y0))[0] ?? null;
}

/** The way a space splits best: across its longer side. */
export const splitDirFor = (k: Compartment): SplitDir => (k.x1 - k.x0 >= k.y1 - k.y0 ? 'frontToBack' : 'sideToSide');

/** Slide a divider to where its slab starts along its row. */
export function moveDivider(d: Design, id: string, pos: number) {
  if (isDivider(d.panels[id])) setDividerOffset(d, id, pos);
}

/** Remove a divider (only a divider: Guided never removes a side or the bottom). */
export function removeDivider(d: Design, id: string) {
  if (isDivider(d.panels[id])) deletePanel(d, id);
}

/** The box's lid as Guided names it. */
export function lidOf(d: Design): LidChoice | 'flaps' {
  const t = boxTrayOf(d);
  const k = t ? boxLid(d, t).kind : 'none';
  return k === 'liftoff' || k === 'hinged' || k === 'arched' || k === 'flaps' ? k : 'none';
}

/** A lid of the three pictures; its kind stays automatic (no style, no hasps). */
export function setLid(d: Design, choice: LidChoice): boolean {
  const t = boxTrayOf(d);
  return !!t && setBoxLid(d, t, choice).ok;
}

export function lidWhyNot(d: Design, choice: LidChoice) {
  const t = boxTrayOf(d);
  return t ? lidWhy(d, t, choice) : 'lid.why.none';
}

/** A divider's row: where it is and how far it can go (for the grips). */
export const rowOf = dividerRow;
