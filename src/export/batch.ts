// Teacher batching: pieces from several students' projects (same material
// and thickness) packed onto shared sheets with the same packer and export
// code students use, each piece labelled with its owner on the guide layer.
import type { Design } from '../model/types';
import type { TaggedContour } from '../geom/types';
import { createDesign } from '../model/ops';
import { pack, pieceCopies, placementXform, sheetGroups, type PieceCopy } from '../model/pack';
import { xformContour } from '../geom/vec';
import { pieceLabel as label } from './label';
import { compensatePiece, type KerfMode, type PreparedSheet, type PrepError } from './prepare';

export type BatchItem = { design: Design; label: string; id: string };
/** `skipped`: the items (by id) that could not be included, e.g. a damaged submission. */
export type BatchResult = { sheets: PreparedSheet[]; errors: PrepError[]; skipped: string[] } | { error: 'mixed' | 'empty' };

export const sameMaterial = (a: Design, b: Design) => a.material.kind === b.material.kind && Math.abs(a.material.thickness - b.material.thickness) < 1e-6;

export function batchExport(items: BatchItem[], kerfMode: KerfMode = 'nominal'): BatchResult {
  if (!items.length) return { error: 'empty' };
  if (items.some((it) => !sameMaterial(it.design, items[0].design))) return { error: 'mixed' };
  const first = items[0].design;
  const synth = createDesign(first.material);
  synth.sheetMargin = first.sheetMargin;
  synth.sheetSpacing = first.sheetSpacing;
  // one submission that cannot be cut (a damaged design) is left out and named, never the whole batch
  const skipped: string[] = [];
  const copies: (PieceCopy & { owner: string })[] = items.flatMap((it, i) => {
    try {
      // the batch accepts each design's working material as the first's (same kind and thickness): its
      // pieces go on the shared sheets, cut with the first design's profile (BUGFIX_PLAN B20)
      const own = it.design.material.id;
      return pieceCopies(it.design).map((c) => ({ ...c, mat: c.mat === own ? first.material.id : c.mat, key: `${i}:${c.key}`, pieceKey: `${i}:${c.pieceKey}`, owner: it.label }));
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
    let contours = c.contours;
    if (kerfMode === 'compensated') {
      const r = compensatePiece(c.contours, g.profile.kerf);
      if (!r.ok && c.copy === 0) errors.push({ pieceKey: c.pieceKey });
      contours = r.contours;
    }
    const xf = placementXform(pl, c.h);
    for (const tc of [...contours, ...label(c.owner, c.w, c.h)]) g.list[pl.sheet].contours.push({ ...tc, contour: xformContour(xf, tc.contour), ref: { ...tc.ref, pieceKey: c.key } });
  }
  const sheets = groups.flatMap((g) => g.list);
  return { sheets, errors, skipped };
}
