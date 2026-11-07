// Teacher batching: pieces from several students' projects (same material
// and thickness) packed onto shared sheets with the same packer and export
// code students use, each piece labelled with its owner on the guide layer.
import type { Design } from '../model/types';
import type { TaggedContour } from '../geom/types';
import { createDesign } from '../model/ops';
import { pack, pieceCopies, placementXform, sheetCount, type PieceCopy } from '../model/pack';
import { polygonContour, xformContour } from '../geom/vec';
import { outlineText } from '../text/outline';
import { compensatePiece, type KerfMode, type PreparedSheet, type PrepError } from './prepare';

export type BatchItem = { design: Design; label: string; id: string };
export type BatchResult = { sheets: PreparedSheet[]; errors: PrepError[] } | { error: 'mixed' | 'empty' };

export const sameMaterial = (a: Design, b: Design) => a.material.kind === b.material.kind && Math.abs(a.material.thickness - b.material.thickness) < 1e-6;

/** Name label, or initials when the name does not fit the piece. */
function label(text: string, w: number, h: number): TaggedContour[] {
  const size = Math.max(2, Math.min(5, h / 4));
  let o = outlineText(text, 'rubik', size);
  if (o && o.maxX - o.minX > w * 0.8) {
    const initials = text.split(/\s+/).filter(Boolean).map((s) => [...s][0]).join('');
    o = outlineText(initials, 'rubik', size);
  }
  if (!o || o.maxX - o.minX > w * 0.9) return [];
  return o.polys.map((p) => ({ op: 'guide' as const, role: 'line' as const, contour: polygonContour(p.map((q) => ({ x: q.x + w / 2, y: q.y + h / 2 }))) }));
}

export function batchExport(items: BatchItem[], kerfMode: KerfMode = 'nominal'): BatchResult {
  if (!items.length) return { error: 'empty' };
  if (items.some((it) => !sameMaterial(it.design, items[0].design))) return { error: 'mixed' };
  const first = items[0].design;
  const synth = createDesign(first.material);
  synth.sheetMargin = first.sheetMargin;
  synth.sheetSpacing = first.sheetSpacing;
  const copies: (PieceCopy & { owner: string })[] = items.flatMap((it, i) =>
    pieceCopies(it.design).map((c) => ({ ...c, key: `${i}:${c.key}`, pieceKey: `${i}:${c.pieceKey}`, owner: it.label })),
  );
  const placements = pack(synth, copies);
  const n = sheetCount(placements);
  const sheets: PreparedSheet[] = Array.from({ length: n }, (_, i) => ({ index: i, w: first.material.sheetW, h: first.material.sheetH, contours: [] }));
  const errors: PrepError[] = [];
  for (const c of copies) {
    const pl = placements[c.key];
    let contours = c.contours;
    if (kerfMode === 'compensated') {
      const r = compensatePiece(c.contours, first.material.kerf);
      if (!r.ok && c.copy === 0) errors.push({ pieceKey: c.pieceKey });
      contours = r.contours;
    }
    const xf = placementXform(pl, c.h);
    for (const tc of [...contours, ...label(c.owner, c.w, c.h)]) sheets[pl.sheet].contours.push({ ...tc, contour: xformContour(xf, tc.contour), ref: { ...tc.ref, pieceKey: c.key } });
  }
  return { sheets, errors };
}
