// Export preparation: one prepared result shared by preview, validation and
// the file writers. Nominal geometry only; kerf compensation is applied here
// (and only here) once compensated mode is enabled (milestone 4).
import type { Design } from '../model/types';
import type { TaggedContour } from '../geom/types';
import { xformContour } from '../geom/vec';
import { pack, pieceCopies, placementXform, sheetCount } from '../model/pack';

export type KerfMode = 'nominal';

export type PreparedSheet = { index: number; w: number; h: number; contours: TaggedContour[] };
export type Prepared = { sheets: PreparedSheet[]; kerfMode: KerfMode; kerf: number };

export function prepareExport(d: Design): Prepared {
  const copies = pieceCopies(d);
  const placements = pack(d, copies);
  const n = sheetCount(placements);
  const sheets: PreparedSheet[] = Array.from({ length: n }, (_, i) => ({ index: i, w: d.material.sheetW, h: d.material.sheetH, contours: [] }));
  for (const c of copies) {
    const pl = placements[c.key];
    if (!pl) continue;
    const xf = placementXform(pl, c.h);
    for (const tc of c.contours) {
      sheets[pl.sheet].contours.push({ ...tc, contour: xformContour(xf, tc.contour), ref: { ...tc.ref, pieceKey: c.key } });
    }
  }
  return { sheets, kerfMode: 'nominal', kerf: d.material.kerf };
}
