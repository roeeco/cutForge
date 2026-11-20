// The rules a made model's seam folds follow, shared by the unfolder and the engine so the
// net the unfolder checks is the net the engine lays (papercraft's lesson: one layout, not
// two). Pure, with no imports, so the unfold Worker can take it.

/** Dihedrals a seam fold is laid out for (degrees inside the solid): sharper or more reflex folds are cut. */
export const SEAM_MIN = 5, SEAM_MAX = 355;

/**
 * Folds this close to flat (degrees) are kept but not scored: the board bends there by
 * itself, as a faceted sphere's or a shallow cone's facets do (papercraft's "soft hidden"
 * edges, 3° by default there too).
 */
export const SOFT_FOLD = 3;

/** Can the engine lay a seam fold at this dihedral? */
export const seamFoldable = (dihedral: number) => dihedral >= SEAM_MIN && dihedral <= SEAM_MAX;

/**
 * How deep inside the two edges a crease lies, summed (mm): where the mid-planes of two
 * boards (thicknesses tP, tC, material on the solid's inside) meet across a fold of
 * `dihedral` degrees. The closed form of `creaseDepths` for a made seam; negative past 180°
 * (an inside corner: the crease lies outside the edges).
 */
export function creaseSum(tP: number, tC: number, dihedral: number): number {
  const a = (dihedral * Math.PI) / 180;
  const s = Math.sin(a), c = Math.cos(a);
  if (Math.abs(s) < 1e-9) return 0;
  // in the fold's cross-section: P along +x, C at angle a, each mid-plane half its thickness inside
  const r = (tP / 2 + (tC / 2) * c) / s;
  return r + (r * c + (tC / 2) * s);
}
