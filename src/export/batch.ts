// Teacher batching: pieces from several students' projects (same material
// and thickness) packed onto shared sheets with the same packer and export
// code students use, each piece labelled with its owner on the guide layer.
import type { Design } from '../model/types';
import type { TaggedContour } from '../geom/types';
import { createDesign } from '../model/ops';
import { pack, pieceCopies, placementXform, sheetGroups, type PieceCopy } from '../model/pack';
import { polygonContour, xformContour } from '../geom/vec';
import { outlineText } from '../text/outline';
import { compensatePiece, kissPanels, type KerfMode, type PreparedSheet, type PrepError } from './prepare';
import { pieceLabel } from './label';
import { refitArcs } from '../geom/arcfit';

export type BatchItem = { design: Design; label: string; id: string };
/** `skipped`: the items (by id) that could not be included, e.g. a damaged submission. */
export type BatchResult = { sheets: PreparedSheet[]; errors: PrepError[]; skipped: string[] } | { error: 'mixed' | 'empty' };

export const sameMaterial = (a: Design, b: Design) => a.material.kind === b.material.kind && Math.abs(a.material.thickness - b.material.thickness) < 1e-6;

/** The kiss-score note (the export's own words; a teacher's batch has no student language). */
const KISS_UP = 'THIS SIDE UP (kiss scores)', KISS_UP_SHORT = 'UP';

/** The smallest label text worth drawing (mm); a piece too small for it gets none (BUGFIX_PLAN B21). */
const MIN_LABEL = 1;

/** Name label, or initials when the name does not fit the piece, scaled to fit it both ways (or none). */
function label(text: string, w: number, h: number): TaggedContour[] {
  let size = Math.min(5, h / 4);
  if (size < MIN_LABEL) return [];
  let o = outlineText(text, 'rubik', size);
  if (o && o.maxX - o.minX > w * 0.8) {
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

export function batchExport(items: BatchItem[], kerfMode: KerfMode = 'nominal'): BatchResult {
  if (!items.length) return { error: 'empty' };
  if (items.some((it) => !sameMaterial(it.design, items[0].design))) return { error: 'mixed' };
  const first = items[0].design;
  const synth = createDesign(first.material);
  synth.sheetMargin = first.sheetMargin;
  synth.sheetSpacing = first.sheetSpacing;
  // one submission that cannot be cut (a damaged design) is left out and named, never the whole batch
  const skipped: string[] = [];
  // a piece with kiss-scored bends is cut inside up, mirrored, with its note (as a student's own export does)
  const copies: (PieceCopy & { owner: string; kiss: boolean })[] = items.flatMap((it, i) => {
    try {
      const k = kissPanels(it.design);
      // the batch accepts each design's working material as the first's (same kind and thickness): its
      // pieces go on the shared sheets, cut with the first design's profile (BUGFIX_PLAN B20)
      const own = it.design.material.id;
      return pieceCopies(it.design).map((c) => ({ ...c, mat: c.mat === own ? first.material.id : c.mat, key: `${i}:${c.key}`, pieceKey: `${i}:${c.pieceKey}`, owner: it.label, kiss: c.panels.some((n) => k.has(n.panelId)) }));
    } catch {
      skipped.push(it.id);
      return [];
    }
  });
  // boards of their own material: each material on its own sheets (grouped by material, like a student's export)
  for (const it of items) if (it.design.materials) synth.materials = { ...(synth.materials ?? {}), ...it.design.materials };
  const placements = pack(synth, copies);
  const groups = sheetGroups(synth, placements).map((g) => ({ ...g, list: Array.from({ length: g.sheets }, (_, i): PreparedSheet => ({ index: i, w: g.profile.sheetW, h: g.profile.sheetH, contours: [], ...(g.mat === synth.material.id ? {} : { mat: g.mat }) })) }));
  const errors: PrepError[] = [];
  for (const c of copies) {
    const pl = placements[c.key];
    const g = groups.find((x) => x.mat === (pl.mat ?? synth.material.id)) ?? groups[0];
    // arcs the outline pipeline flattened become true arcs again (milestone 62), as in the student's own export
    let contours = c.contours.map((tc) => (tc.op === 'cut' && tc.contour.closed ? { ...tc, contour: refitArcs(tc.contour) } : tc));
    if (kerfMode === 'compensated') {
      const r = compensatePiece(contours, g.profile.kerf);
      if (!r.ok && c.copy === 0) errors.push({ pieceKey: c.pieceKey });
      contours = r.contours;
    }
    const xf = placementXform(pl, c.h, c.w);
    // kiss-scored: mirrored in its box, the note in its upper half and the owner's name in the lower half
    const flip = (tc: TaggedContour): TaggedContour => (c.kiss ? { ...tc, contour: xformContour({ tx: c.w, ty: 0, rot: 0, mirror: true }, tc.contour) } : tc);
    const up = (tc: TaggedContour): TaggedContour => ({ ...tc, contour: xformContour({ tx: 0, ty: c.h / 2, rot: 0 }, tc.contour) });
    const notes = c.kiss ? [...pieceLabel(KISS_UP, c.w, c.h / 2, KISS_UP_SHORT).map(up), ...label(c.owner, c.w, c.h / 2)] : label(c.owner, c.w, c.h);
    for (const tc of [...contours.map(flip), ...notes]) g.list[pl.sheet].contours.push({ ...tc, contour: xformContour(xf, tc.contour), ref: { ...tc.ref, pieceKey: c.key } });
  }
  const sheets = groups.flatMap((g) => g.list);
  return { sheets, errors, skipped };
}
