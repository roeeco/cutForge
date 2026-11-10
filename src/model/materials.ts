import type { ConnectionKind, Design, MaterialProfile } from './types';

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
 * Connections offered when growing a panel, by the fold angle. A laser cuts
 * square through the sheet, so slots and fingers only fit panels at 90°.
 * Plywood leaning over its parent is held by side walls (or glued edge to
 * edge); leaning out past the edge, only a glued edge holds it.
 */
export function connectionsFor(m: MaterialProfile, angle: number): ConnectionKind[] {
  const square = Math.abs(angle - 90) < 1e-6;
  if (m.kind === 'plywood') return square ? ['finger', 'tabslot', 'butt'] : angle < 90 ? ['lean', 'butt'] : ['butt'];
  return square ? ['fold', 'glue', 'tabslot', 'butt'] : ['fold', 'glue'];
}

/** Smallest safe web of material between a cut and an edge (mm). */
export function minWeb(m: MaterialProfile): number {
  return m.kind === 'plywood' ? 2 : m.kind === 'corrugated' ? 3 : 1.5;
}

// ---------------------------------------------------------------------------
// A material for each board (milestone 36). The design has a working material
// (`Design.material`); a board may override it (`Panel.material`, a profile id
// found in `Design.materials`, or the working material's own id). Absent: the
// working material, so designs with one material are exactly as before.

type MatDesign = Pick<Design, 'material' | 'materials' | 'panels'>;

/** The profile a material id stands for in this design (the working material, one of its others, or a built-in one). */
export function profileOf(d: Pick<Design, 'material' | 'materials'>, id: string | undefined): MaterialProfile {
  if (!id || id === d.material.id) return d.material;
  return d.materials?.[id] ?? materialById(id) ?? d.material;
}

/** A board's material. */
export function matOf(d: MatDesign, panelId: string): MaterialProfile {
  return profileOf(d, d.panels[panelId]?.material);
}

/** A board's thickness. */
export function tOf(d: MatDesign, panelId: string): number {
  return matOf(d, panelId).thickness;
}

/** The id of a board's material (the working material's id when it has no override). */
export function matIdOf(d: MatDesign, panelId: string): string {
  const id = d.panels[panelId]?.material;
  return id && id !== d.material.id && profileOf(d, id) !== d.material ? id : d.material.id;
}

/** Does the design use more than one material? */
export function mixedMaterials(d: MatDesign): boolean {
  for (const p of Object.values(d.panels)) if (p.material && p.material !== d.material.id && profileOf(d, p.material) !== d.material) return true;
  return false;
}

/** Same material for folding: the same kind and thickness (a fold or fold-over joins only these). */
export function sameMaterial(a: MaterialProfile, b: MaterialProfile): boolean {
  return a === b || (a.kind === b.kind && Math.abs(a.thickness - b.thickness) < 1e-9 && Math.abs(a.foldAllowance - b.foldAllowance) < 1e-9);
}

/**
 * Kinds a joint between boards of two materials may take, from the kinds the
 * feature-carrying board's material allows: fingers need both in plywood (and
 * leaning plywood too), folds both in the same card or corrugated material.
 */
export function pairFilter(kinds: ConnectionKind[], own: MaterialProfile, other: MaterialProfile | undefined): ConnectionKind[] {
  if (!other || own === other) return kinds;
  return kinds.filter((k) => {
    if (k === 'finger' || k === 'lean') return own.kind === 'plywood' && other.kind === 'plywood';
    if (k === 'fold') return own.kind !== 'plywood' && sameMaterial(own, other);
    return true;
  });
}

/** Grown joint kinds for a child board on a parent board at this angle. */
export function connectionsForPair(child: MaterialProfile, parent: MaterialProfile, angle: number): ConnectionKind[] {
  const k = pairFilter(connectionsFor(child, angle), child, parent);
  return k.length ? k : ['butt'];
}

/** Every material the design uses, the working material first, with how many boards each has. */
export function materialsInUse(d: MatDesign & Pick<Design, 'order'>): { id: string; profile: MaterialProfile; count: number; working: boolean }[] {
  const n = new Map<string, number>();
  for (const id of d.order) if (d.panels[id]) n.set(matIdOf(d, id), (n.get(matIdOf(d, id)) ?? 0) + 1);
  const out = [{ id: d.material.id, profile: d.material, count: n.get(d.material.id) ?? 0, working: true }];
  for (const [id, count] of n) if (id !== d.material.id) out.push({ id, profile: profileOf(d, id), count, working: false });
  return out;
}

/**
 * Keep `Design.materials` to the materials boards use: overrides naming the
 * working material are dropped (they are the working material), a working
 * material that boards still name after a change of working material is kept
 * there, and unused profiles go. `prev` is the working material before a change.
 */
export function normalizeMaterials(d: Design, prev?: MaterialProfile) {
  if (prev && prev.id !== d.material.id) {
    const named = Object.values(d.panels).some((p) => p.material === prev.id);
    if (named && !d.materials?.[prev.id]) d.materials = { ...(d.materials ?? {}), [prev.id]: { ...prev } };
  }
  const used = new Set<string>();
  for (const p of Object.values(d.panels)) {
    if (!p.material) continue;
    if (p.material === d.material.id) {
      delete p.material;
      continue;
    }
    used.add(p.material);
  }
  if (d.materials) {
    for (const id of Object.keys(d.materials)) if (!used.has(id) || id === d.material.id) delete d.materials[id];
    if (!Object.keys(d.materials).length) delete d.materials;
  }
}
