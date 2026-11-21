// Pairs of presets in one list that are known to look alike (milestone 146, PRESETS_OVERHAUL.md §5.1). Each is a
// group of §2.1 that a later milestone settles; the catalogue tests fail on a pair that is not here, and on a pair
// here that no longer looks alike (so the list only shrinks). Entries are named per list: the sentence's by variant
// id, Guided's by thing id, the missions by mission id.

export type Lookalike = { list: 'sentence' | 'guided' | 'missions'; a: string; b: string; group: string; until: number };

/** The same design shape (connections, closures, bands, angles, lid, flaps, proportions): `structuralFingerprint`. */
export const STRUCTURAL: Lookalike[] = [
  // C: an open box and an open tray differ in height only (and the tray's handles); settled as one card's variants
  { list: 'sentence', a: 'box', b: 'tray', group: 'C', until: 153 },
];

/** The same picture at list size: the browser's perceptual hash (tests/e2e/preset-sheet.spec.ts). */
export const VISUAL: Lookalike[] = [
  // A: the tuck cartons differ underneath (the bottom, which panel a tuck hinges from); the picture is from above
  { list: 'sentence', a: 'ste', b: 'rte', group: 'A', until: 151 },
  { list: 'sentence', a: 'ste', b: 'tuckSnap', group: 'A', until: 151 },
  { list: 'sentence', a: 'rte', b: 'tuckSnap', group: 'A', until: 151 },
  // B: cartons closed by flaps, their flaps drawn shut (milestone 147): a closed lid seen from above; opened in 148
  { list: 'sentence', a: 'sealed', b: 'rsc', group: 'B', until: 148 },
  { list: 'sentence', a: 'box', b: 'sealed', group: 'B', until: 148 },
  // E: the envelopes' flaps are drawn (milestone 147) but folded flat; opened in 148
  { list: 'sentence', a: 'diamondEnvelope', b: 'pocketEnvelope', group: 'E', until: 148 },
  // G: a sleeve seen from above is an open box with no floor
  { list: 'sentence', a: 'box', b: 'sleeve', group: 'G', until: 148 },
];
