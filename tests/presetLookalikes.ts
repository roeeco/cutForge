// Pairs of presets in one list that are known to look alike (milestone 146, PRESETS_OVERHAUL.md §5.1). Each is a
// group of §2.1 that a later milestone settles; the catalogue tests fail on a pair that is not here, and on a pair
// here that no longer looks alike (so the list only shrinks). Entries are named per list: the sentence's by variant
// id, Guided's by thing id, the missions by mission id.

export type Lookalike = { list: 'sentence' | 'guided' | 'missions'; a: string; b: string; group: string; until: number };

/** The same design shape (connections, closures, bands, angles, lid, flaps, proportions): `structuralFingerprint`. */
export const STRUCTURAL: Lookalike[] = [
  // none since milestone 153: box and tray are one card (one entry), the organiser's missions two challenges on it
];

/** The same picture at list size: the browser's perceptual hash (tests/e2e/preset-sheet.spec.ts). */
export const VISUAL: Lookalike[] = [
  // none since milestone 153: the tuck cartons are one card, one entry in the list
];
