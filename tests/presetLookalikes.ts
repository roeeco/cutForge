// Pairs of presets in one list that are known to look alike (milestone 146, PRESETS_OVERHAUL.md §5.1). Each is a
// group of §2.1 that a later milestone settles; the catalogue tests fail on a pair that is not here, and on a pair
// here that no longer looks alike (so the list only shrinks). Entries are named per list: the sentence's by variant
// id, Guided's by thing id, the missions by mission id.

export type Lookalike = { list: 'sentence' | 'guided' | 'missions'; a: string; b: string; group: string; until: number };

/** The same design shape (connections, closures, bands, angles, lid, flaps, proportions): `structuralFingerprint`. */
export const STRUCTURAL: Lookalike[] = [
  // C: an open box and an open tray differ in height only (and the tray's handles); settled as one card's variants
  { list: 'sentence', a: 'box', b: 'tray', group: 'C', until: 153 },
  // D: two missions on the organiser, the same box with dividers at other sizes (records since milestone 150)
  { list: 'missions', a: 'game-organiser', b: 'pencil-box', group: 'D', until: 153 },
];

/** The same picture at list size: the browser's perceptual hash (tests/e2e/preset-sheet.spec.ts). */
export const VISUAL: Lookalike[] = [
  // A: the tuck cartons differ underneath; since milestone 151 their bottom flaps hang open in the picture, which tells
  // the reverse tuck from the others, but a straight tuck's flap hangs behind it and measures 5 bits from the snap-lock
  // on 1.6 mm board: one card with a variant switch in 153
  { list: 'sentence', a: 'ste', b: 'tuckSnap', group: 'A', until: 153 },
];
