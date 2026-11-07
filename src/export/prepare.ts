// Export preparation: one prepared result shared by preview, validation and
// the file writers. The model is always nominal; kerf compensation happens
// here and only here, so it can never be applied twice.
import type { Design } from '../model/types';
import type { Contour, TaggedContour } from '../geom/types';
import { flattenContour, pointInPolygon, xformContour } from '../geom/vec';
import { pack, pieceCopies, placementXform, sheetCount } from '../model/pack';
import { offsetContour } from './offset';

export type KerfMode = 'nominal' | 'compensated';

export type PreparedSheet = { index: number; w: number; h: number; contours: TaggedContour[] };
export type PrepError = { pieceKey: string; panelId?: string };
export type Prepared = { sheets: PreparedSheet[]; kerfMode: KerfMode; kerf: number; errors: PrepError[] };

/**
 * Compensate the cut contours of one piece: a contour whose inside is
 * material (outer outline, island inside a cut-out) grows by kerf/2; a
 * contour whose inside is cut away (hole) shrinks by kerf/2. Which is which
 * follows from how many other cut contours contain it.
 */
export function compensatePiece(contours: TaggedContour[], kerf: number): { contours: TaggedContour[]; ok: boolean } {
  const cuts = contours.filter((c) => c.op === 'cut' && c.contour.closed);
  const polys = cuts.map((c) => flattenContour(c.contour, 0.05));
  let ok = true;
  const out = contours.map((c) => {
    const i = cuts.indexOf(c);
    if (i < 0) return c;
    const probe = polys[i][0];
    const depth = polys.filter((p, j) => j !== i && pointInPolygon(probe, p)).length;
    const grow = depth % 2 === 0;
    const r: Contour | null = offsetContour(c.contour, grow ? kerf / 2 : -kerf / 2);
    if (!r) {
      ok = false;
      return c;
    }
    return { ...c, contour: r };
  });
  return { contours: out, ok };
}

export function prepareExport(d: Design, kerfMode: KerfMode = 'nominal'): Prepared {
  const copies = pieceCopies(d);
  const placements = pack(d, copies);
  const n = sheetCount(placements);
  const sheets: PreparedSheet[] = Array.from({ length: n }, (_, i) => ({ index: i, w: d.material.sheetW, h: d.material.sheetH, contours: [] }));
  const errors: PrepError[] = [];
  const compensated = new Map<string, { contours: TaggedContour[]; ok: boolean }>();
  for (const c of copies) {
    const pl = placements[c.key];
    if (!pl) continue;
    let contours = c.contours;
    if (kerfMode === 'compensated') {
      // copies share geometry: compensate once per piece
      if (!compensated.has(c.pieceKey)) compensated.set(c.pieceKey, compensatePiece(c.contours, d.material.kerf));
      const r = compensated.get(c.pieceKey)!;
      if (!r.ok && c.copy === 0) errors.push({ pieceKey: c.pieceKey, panelId: c.pieceKey });
      contours = r.contours;
    }
    const xf = placementXform(pl, c.h);
    for (const tc of contours) sheets[pl.sheet].contours.push({ ...tc, contour: xformContour(xf, tc.contour), ref: { ...tc.ref, pieceKey: c.key } });
  }
  return { sheets, kerfMode, kerf: d.material.kerf, errors };
}
