// Board grades (milestone 116, DIELINE_DNA_PLAN.md D5b): more boards beside the
// four classroom materials, chosen from the material drawer's *More boards…*.
// Starting points only, scaled from the nearest classroom board: try them on
// scrap. Corrugated 1.6 (E flute) and 4 (C flute) are the built-ins themselves.
import type { MaterialProfile } from './types';
import { MATERIALS } from './materials';

export type BoardFamily = 'boxboard' | 'greyboard' | 'corrugated' | 'plywood';
export type BoardGrade = MaterialProfile & { family: BoardFamily };

const base = (id: string) => MATERIALS.find((m) => m.id === id)!;
const r05 = (v: number) => Math.max(0.05, Math.round(v / 0.05) * 0.05);
/** A grade of thickness t from a built-in: kerf scaled by √(t / its t), its clearance (plywood 0.1), no fold allowance. */
function scaled(from: string, id: string, t: number, family: BoardFamily, extra: Partial<MaterialProfile> = {}): BoardGrade {
  const b = base(from);
  return { ...b, id, thickness: t, kerf: r05(b.kerf * Math.sqrt(t / b.thickness)), clearance: b.kind === 'plywood' ? 0.1 : b.clearance, foldAllowance: 0, nameKey: `mat.grade.${id.replace(/[.-]/g, '')}`, family, ...extra };
}
/** Greyboard bends far less tightly than thin card (starting values, unverified). */
const grey = (t: number) => ({ bend: { smoothR: 20 * t, patternR: 6 * t, pitch: 2.5, k: 0.5 } });

export const BOARD_GRADES: BoardGrade[] = [
  scaled('card-0.5', 'card-0.3', 0.3, 'boxboard'),
  scaled('card-0.5', 'card-0.4', 0.4, 'boxboard'),
  scaled('card-0.5', 'card-0.6', 0.6, 'boxboard'),
  scaled('card-0.5', 'grey-1', 1, 'greyboard', grey(1)),
  scaled('card-0.5', 'grey-1.5', 1.5, 'greyboard', grey(1.5)),
  scaled('card-0.5', 'grey-2', 2, 'greyboard', grey(2)),
  scaled('corr-4', 'corr-3', 3, 'corrugated'),
  scaled('corr-4', 'corr-7', 7, 'corrugated'),
  scaled('ply-3', 'ply-4', 4, 'plywood'),
  // milestone 171 (owner, 21 November: plywood from 3 to 8 mm)
  scaled('ply-3', 'ply-5', 5, 'plywood'),
  scaled('ply-3', 'ply-6', 6, 'plywood'),
  scaled('ply-3', 'ply-8', 8, 'plywood'),
];

/** The families in the drawer's order, each with the built-ins that belong to it shown first. */
export const FAMILIES: { family: BoardFamily; builtIns: string[] }[] = [
  { family: 'boxboard', builtIns: ['card-0.5'] },
  { family: 'greyboard', builtIns: [] },
  { family: 'corrugated', builtIns: ['corr-1.6', 'corr-4'] },
  { family: 'plywood', builtIns: ['ply-3'] },
];

export const ALL_PROFILES: MaterialProfile[] = [...MATERIALS, ...BOARD_GRADES];
/** A built-in material or a grade by its id. */
export const profileById = (id: string): MaterialProfile | undefined => ALL_PROFILES.find((m) => m.id === id);
