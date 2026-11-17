// Text labels on the GUIDE layer, centred on a piece and scaled to fit it
// (teacher batches name each piece's owner; a kiss-scored strip says which
// side is up, milestone 47).
import type { TaggedContour } from '../geom/types';
import { polygonContour } from '../geom/vec';
import { outlineText } from '../text/outline';

/** The smallest label text worth drawing (mm); a piece too small for it gets none (BUGFIX_PLAN B21). */
const MIN_LABEL = 1;

/**
 * Name label, or (`short`: its initials, or the short text given) when it does
 * not fit the piece, scaled to fit it both ways (or none).
 */
export function pieceLabel(text: string, w: number, h: number, short?: string): TaggedContour[] {
  let size = Math.min(5, h / 4);
  if (size < MIN_LABEL) return [];
  let o = outlineText(text, 'rubik', size);
  // a long text that would shrink below 2 mm: the short one instead
  if (o && short !== undefined && (w * 0.8) / Math.max(1e-9, o.maxX - o.minX) * size < 2) {
    text = short;
    o = outlineText(text, 'rubik', size);
  } else if (o && short === undefined && o.maxX - o.minX > w * 0.8) {
    text = text.split(/\s+/).filter(Boolean).map((s) => [...s][0]).join('');
    o = outlineText(text, 'rubik', size);
  }
  if (!o) return [];
  const f = Math.min(1, (w * 0.8) / Math.max(1e-9, o.maxX - o.minX), (h * 0.8) / Math.max(1e-9, o.maxY - o.minY));
  if (f < 1) {
    size *= f;
    if (size < MIN_LABEL) return [];
    o = outlineText(text, 'rubik', size);
    if (!o) return [];
  }
  // centred on the piece
  const cx = (o.minX + o.maxX) / 2, cy = (o.minY + o.maxY) / 2;
  return o.polys.map((p) => ({ op: 'guide' as const, role: 'line' as const, contour: polygonContour(p.map((q) => ({ x: q.x - cx + w / 2, y: q.y - cy + h / 2 }))) }));
}

