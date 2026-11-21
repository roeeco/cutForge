// A design's picture wherever one is shown (the sentence and its list, Follow a mission, Guided's gallery, Keep
// working): the SVG illustration (illustrate.ts), or the WebGL thumbnail when a design cannot be illustrated.
import type { Design } from '../model/types';
import { illustrateDesign, type Prop } from './illustrate';
import { renderThumbnail } from './thumbnail';

/** What a mission's picture shows inside its box. */
export const MISSION_PROP: Record<string, Prop> = { 'pencil-box': 'pencils', 'dice-tray': 'dice' };

export function designPicture(d: Design, w: number, h: number, opts: { prop?: Prop } = {}): string | null {
  try {
    const svg = illustrateDesign(d, w, h, opts);
    if (svg) return svg;
  } catch {
    // fall back to the stage's look
  }
  // drawn at twice the size it is shown (milestone 147), so it stays sharp on a laptop's screen
  return renderThumbnail(d, w * 2, h * 2);
}
