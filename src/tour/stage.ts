// The first-use tour's link to the 3D stage (milestone 43): the stage
// registers how it projects a world point to the screen and how it sets the
// camera, and the tour overlay uses them. No React and no store here, so both
// sides can import it.
import type { V3 } from '../model/types';

export type StageLink = {
  /** Screen position (client px) of a world point, or null when it is behind the camera. */
  project: (p: V3) => { x: number; y: number } | null;
  /** Put the camera at `pos`, looking at `target`. */
  setCamera: (pos: V3, target: V3) => void;
};

let link: StageLink | null = null;
let pending: [V3, V3] | null = null;

/** The stage registers itself while it is shown (null when it goes). */
export function registerStage(l: StageLink | null) {
  link = l;
  if (l && pending) {
    l.setCamera(...pending);
    pending = null;
  }
}

/** Project a world point with the stage, if it is shown. */
export function projectWorld(p: V3): { x: number; y: number } | null {
  return link ? link.project(p) : null;
}

/** Set the camera now, or as soon as the stage is shown. */
export function requestCamera(pos: V3, target: V3) {
  if (link) link.setCamera(pos, target);
  else pending = [pos, target];
}

/** The camera the tour starts with: a three-quarter view over the origin. */
export const TOUR_CAMERA: [V3, V3] = [
  [170, 230, 300],
  [0, 20, 0],
];
