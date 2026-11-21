// Guided's gallery (milestone 106, GUIDED_MODE.md §3.1): the things a student can start from. The missions,
// then the plain things, each one of the sentence's structures with set words (ROADMAP §5.2 #3): this file
// holds only words, never a recipe. Milestone 146: which things, in which order and with which words, is the
// catalogue's (templates/catalogue.ts); their ids are kept for the classes' saved lists.
import type { Design, MaterialProfile } from '../model/types';
import type { MsgKey } from '../i18n';
import { catalogueMissions, guidedCan, guidedEntries } from '../templates/catalogue';
import { guidedDesign, solidDesign } from '../templates/guidedDesigns';
import { startMission } from '../easy/missions';
import { offered } from '../easy/plainThings';

export type Thing = {
  id: string;
  title: MsgKey;
  blurb: MsgKey;
  /** A mission's id, when the thing is one. */
  mission?: string;
  /** Can it be made in this material? */
  can: (m: MaterialProfile) => boolean;
  /** Why it cannot (shown on its greyed card). */
  why?: MsgKey;
  start: (m: MaterialProfile) => Design;
};

/** The plain things: the catalogue's Guided entries that are structures (owner question 12: the round box is 100 × 100 outside, its inside measured). */
export const PLAIN: Thing[] = guidedEntries()
  .filter((x) => !x.v.solid)
  .map(({ v, g }) => ({ id: g.id, title: g.title, blurb: g.blurb, can: (m: MaterialProfile) => guidedCan(v, g, m), ...(g.why ? { why: g.why } : {}), start: (m: MaterialProfile) => guidedDesign(v, g, m) }));

/** A ready shape (milestone 128): see templates/guidedDesigns.ts. */
export const startSolid = solidDesign;

/** The ready shapes (R9): a pyramid and a diamond, from the catalogue. */
export const SHAPE_THINGS: Thing[] = guidedEntries()
  .filter((x) => !!x.v.solid)
  .map(({ v, g }) => ({ id: g.id, title: g.title, blurb: g.blurb, can: (m: MaterialProfile) => guidedCan(v, g, m), start: (m: MaterialProfile) => guidedDesign(v, g, m) }));

/** The missions Guided offers (the Escape box needs hasps, which Guided does not have: owner question 8). */
export const GUIDED_MISSIONS: Thing[] = catalogueMissions().filter((ms) => !ms.levels || ms.levels.includes('guided')).map((ms) => ({
  id: ms.id,
  title: ms.title,
  blurb: ms.description,
  mission: ms.id,
  can: (m) => ms.materials.includes(m.kind),
  start: (m) => startMission(ms, m),
}));

/**
 * The cards for a class's list (`missions` in the preferences): absent, every thing; a list filters the
 * missions, and the plain things too when it names any (owner question 10: an older list, of missions only,
 * offers every plain thing).
 */
export function thingsFor(list?: string[] | null): Thing[] {
  return [...GUIDED_MISSIONS, ...PLAIN, ...SHAPE_THINGS].filter((x) => offered(list, x.id));
}
