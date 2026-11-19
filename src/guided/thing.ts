// What Guided says about the thing on the stage (milestone 105): pure, read from the design.
import type { Design } from '../model/types';
import { boxSize, type BoxDims } from '../model/boxSize';
import { mainTray } from '../templates/structures/box';
import { compartments } from '../easy/objects';
import { boxLid } from '../easy/lid';

export type ThingFacts = {
  /** The clear inside of the main box, rounded to 0.1 mm; null when the thing is no box. */
  inside: BoxDims | null;
  /** Its spaces (compartments). */
  spaces: number;
  /** Its lid: none, lifts off, hinged or arched; null when the thing is no box. */
  lid: 'none' | 'liftoff' | 'hinged' | 'arched' | null;
};

const r1 = (x: number) => Math.round(x * 10) / 10;

export function thingFacts(d: Design): ThingFacts {
  const tray = mainTray(d);
  const t = tray ? d.trays?.[tray] : undefined;
  const size = tray ? boxSize(d, tray, 'inside') : null;
  if (!tray || !t || !size) return { inside: null, spaces: 0, lid: null };
  const lid = boxLid(d, tray);
  return {
    inside: { w: r1(size.w), d: r1(size.d), h: r1(size.h) },
    spaces: compartments(d, t.baseId).length,
    lid: lid.kind === 'liftoff' || lid.kind === 'hinged' || lid.kind === 'arched' ? lid.kind : 'none',
  };
}
