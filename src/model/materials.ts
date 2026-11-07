import type { ConnectionKind, MaterialProfile } from './types';

// Starting points only: calibrate thickness, kerf and clearance on the actual
// material and laser with a test cut.
export const MATERIALS: MaterialProfile[] = [
  { id: 'card-0.5', kind: 'card', nameKey: 'mat.card', thickness: 0.5, kerf: 0.1, clearance: 0.1, foldAllowance: 0.6, sheetW: 500, sheetH: 300, grain: 'none' },
  { id: 'corr-1.6', kind: 'corrugated', nameKey: 'mat.corr16', thickness: 1.6, kerf: 0.2, clearance: 0.2, foldAllowance: 2, sheetW: 600, sheetH: 400, grain: 'y' },
  { id: 'corr-4', kind: 'corrugated', nameKey: 'mat.corr4', thickness: 4, kerf: 0.25, clearance: 0.3, foldAllowance: 5, sheetW: 600, sheetH: 400, grain: 'y' },
  { id: 'ply-3', kind: 'plywood', nameKey: 'mat.ply3', thickness: 3, kerf: 0.15, clearance: 0.1, foldAllowance: 0, sheetW: 600, sheetH: 400, grain: 'x' },
];

export const DEFAULT_MATERIAL = MATERIALS[3];

export function materialById(id: string): MaterialProfile | undefined {
  return MATERIALS.find((m) => m.id === id);
}

export const ANGLES = [90, 60, 45, 30, 15] as const;

/**
 * Connections offered when growing a panel, by the actual angle. A laser cuts
 * square through the sheet, so slots and fingers only fit panels at 90°.
 * Plywood at other angles leans on its parent and is held by side walls.
 */
export function connectionsFor(m: MaterialProfile, angle: number): ConnectionKind[] {
  const square = Math.abs(angle - 90) < 1e-6;
  if (m.kind === 'plywood') return square ? ['finger', 'tabslot', 'butt'] : ['lean'];
  return square ? ['fold', 'glue', 'tabslot', 'butt'] : ['fold', 'glue'];
}

/** Smallest safe web of material between a cut and an edge (mm). */
export function minWeb(m: MaterialProfile): number {
  return m.kind === 'plywood' ? 2 : m.kind === 'corrugated' ? 3 : 1.5;
}
