// Export preparation: one prepared result shared by preview, validation and
// the file writers. The model is always nominal; kerf compensation happens
// here and only here, so it can never be applied twice.
import type { Design, MaterialProfile } from '../model/types';
import type { Contour, TaggedContour } from '../geom/types';
import { flattenContour, pointInPolygon, xformContour } from '../geom/vec';
import { pack, pieceCopies, placementXform, sheetGroups } from '../model/pack';
import { offsetContour } from './offset';
import { refitArcs } from '../geom/arcfit';
import { pieceLabel } from './label';

export type KerfMode = 'nominal' | 'compensated';

/** `index` counts the sheets of its material; `mat` names that material when it is not the working one. */
export type PreparedSheet = { index: number; w: number; h: number; contours: TaggedContour[]; mat?: string };
export type PrepError = { pieceKey: string; panelId?: string };
/** `sheets`: every sheet, material by material; `materials`: the same sheets grouped by material (one group for one material). */
export type Prepared = { sheets: PreparedSheet[]; kerfMode: KerfMode; kerf: number; errors: PrepError[]; materials: { mat: string; profile: MaterialProfile; sheets: PreparedSheet[] }[] };

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
    // an open cut line (a bend's perforation or hinge cut, milestone 47) is shortened by half the kerf at each end, so it cuts its drawn length
    if (c.op === 'cut' && !c.contour.closed) return { ...c, contour: shortenOpen(c.contour, kerf / 2) };
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

/** An open chain of straight segments with `k` mm taken off each end (a chain shorter than 2k is left at its middle point). */
export function shortenOpen(c: Contour, k: number): Contour {
  if (k <= 0 || c.closed || !c.segs.length || c.segs.some((s) => s.k !== 'L')) return c;
  const segs = c.segs.map((s) => ({ ...s, a: { ...s.a }, b: { ...s.b } }));
  const len = (s: { a: { x: number; y: number }; b: { x: number; y: number } }) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
  const total = segs.reduce((t, s) => t + len(s), 0);
  const cut = Math.min(k, total / 2 - 1e-6);
  if (cut <= 0) return c;
  const f = segs[0], l = segs[segs.length - 1];
  const lf = len(f), ll = len(l);
  if (lf > cut && ll > cut) {
    f.a = { x: f.a.x + ((f.b.x - f.a.x) * cut) / lf, y: f.a.y + ((f.b.y - f.a.y) * cut) / lf };
    const ll2 = len(l);
    l.b = { x: l.b.x - ((l.b.x - l.a.x) * cut) / ll2, y: l.b.y - ((l.b.y - l.a.y) * cut) / ll2 };
  }
  return { closed: false, segs };
}

/** Text the export writes on the GUIDE layer (the student's language). */
export type ExportLabels = { kissUp: string; kissUpShort: string };
const LABELS: ExportLabels = { kissUp: 'THIS SIDE UP (kiss scores)', kissUpShort: 'UP' };

/** Does this piece have kiss scores (so the side up when it is cut matters)? */
const kissed = (d: Design, panels: { panelId: string }[]) => panels.some((n) => d.panels[n.panelId]?.bent?.pattern?.zones.some((z) => z.style === 'kiss'));

export function prepareExport(d: Design, kerfMode: KerfMode = 'nominal', labels: ExportLabels = LABELS): Prepared {
  const copies = pieceCopies(d);
  const placements = pack(d, copies);
  // each material its own sheets (milestone 36), in the layout's order: the working material first
  const groups = sheetGroups(d, placements).map((g) => ({
    ...g,
    list: Array.from({ length: g.sheets }, (_, i): PreparedSheet => ({ index: i, w: g.profile.sheetW, h: g.profile.sheetH, contours: [], ...(g.mat === d.material.id ? {} : { mat: g.mat }) })),
  }));
  const groupOf = (mat: string | undefined) => groups.find((g) => g.mat === (mat ?? d.material.id)) ?? groups[0];
  const errors: PrepError[] = [];
  const compensated = new Map<string, { contours: TaggedContour[]; ok: boolean }>();
  // arcs the outline pipeline flattened become true arcs again (milestone 45), once per piece
  const arced = new Map<string, TaggedContour[]>();
  for (const c of copies) {
    const pl = placements[c.key];
    if (!pl) continue;
    const g = groupOf(pl.mat);
    if (!arced.has(c.pieceKey)) arced.set(c.pieceKey, c.contours.map((tc) => (tc.op === 'cut' && tc.contour.closed ? { ...tc, contour: refitArcs(tc.contour) } : tc)));
    const base = arced.get(c.pieceKey)!;
    let contours = base;
    if (kerfMode === 'compensated') {
      // copies share geometry: compensate once per piece, with its own material's kerf
      if (!compensated.has(c.pieceKey)) compensated.set(c.pieceKey, compensatePiece(base, g.profile.kerf));
      const r = compensated.get(c.pieceKey)!;
      if (!r.ok && c.copy === 0) errors.push({ pieceKey: c.pieceKey, panelId: c.pieceKey });
      contours = r.contours;
    }
    const xf = placementXform(pl, c.h);
    // a kiss-scored strip says which side is up (milestone 47), on the guide layer
    const extra = kissed(d, c.panels) ? pieceLabel(labels.kissUp, c.w, c.h, labels.kissUpShort) : [];
    for (const tc of [...contours, ...extra]) g.list[pl.sheet].contours.push({ ...tc, contour: xformContour(xf, tc.contour), ref: { ...tc.ref, pieceKey: c.key } });
  }
  return {
    sheets: groups.flatMap((g) => g.list),
    kerfMode,
    kerf: d.material.kerf,
    errors,
    materials: groups.map((g) => ({ mat: g.mat, profile: g.profile, sheets: g.list })),
  };
}
