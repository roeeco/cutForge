// Guided's gallery (milestone 106, GUIDED_MODE.md §3.1): the things a student can start from. The missions,
// then the plain things, each one of the sentence's structures with set words (ROADMAP §5.2 #3): this file
// holds only words, never a recipe.
import type { Design, MaterialProfile } from '../model/types';
import type { MsgKey } from '../i18n';
import { defaults, generate, templateById } from '../templates/registry';
import { makes, type Params } from '../templates/types';

import { MISSIONS, startMission } from '../easy/missions';
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

/**
 * A plain thing's design: its structure with its words, then detached from the template (owner question 6):
 * nothing later rebuilds it from the words (a change of board, the class's profile, a fix), so Build's sizes
 * stay. Its sizes stay stated as the inside, and its boards keep their stable names.
 */
function plain(id: string, words: Params): (m: MaterialProfile) => Design {
  return (m) => {
    const t = templateById(id)!;
    const d = generate(t, m, { ...defaults(t), ...words });
    delete d.template;
    d.sizeAs = 'inside';
    return d;
  };
}

/** The plain things (owner question 12: the round box is 100 × 100 outside, its inside measured). */
export const PLAIN: Thing[] = [
  { id: 'box', title: 'g.thing.box', blurb: 'g.thing.box.blurb', can: (m) => makes(templateById('box')!, m), start: plain('box', { width: 120, depth: 80, height: 45, sizeAs: 'inside' }) },
  { id: 'box-lid', title: 'g.thing.boxLid', blurb: 'g.thing.boxLid.blurb', can: (m) => makes(templateById('box')!, m), start: plain('box', { width: 120, depth: 80, height: 45, sizeAs: 'inside', lid: 'liftoff' }) },
  { id: 'round-box', title: 'g.thing.round', blurb: 'g.thing.round.blurb', can: (m) => makes(templateById('box')!, m), start: plain('box', { width: 100, depth: 100, height: 45, sizeAs: 'inside', shape: 'round' }) },
  { id: 'carton', title: 'g.thing.carton', blurb: 'g.thing.carton.blurb', can: (m) => makes(templateById('carton')!, m), why: 'g.thing.cartonNo', start: plain('carton', {}) },
];

/** The missions Guided offers (the Escape box needs hasps, which Guided does not have: owner question 8). */
export const GUIDED_MISSIONS: Thing[] = MISSIONS.filter((ms) => !ms.levels || ms.levels.includes('guided')).map((ms) => ({
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
  return [...GUIDED_MISSIONS, ...PLAIN].filter((x) => offered(list, x.id));
}
