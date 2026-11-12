// From raw parts to parts to cut (milestones 52–53 add slots, the base plate and labels).
import type { Design } from '../model/types';
import type { TaggedContour } from '../geom/types';
import type { Kernel } from '../sculpt/kernel';
import type { Part, WaffleModel } from './derive';

/** A part ready to cut: its rings and what is engraved on it. */
export type CutPart = Part & { engrave: TaggedContour[] };

export function finishParts(_k: Kernel, _d: Design, m: WaffleModel): CutPart[] {
  return m.parts.map((p) => ({ ...p, engrave: [] }));
}
