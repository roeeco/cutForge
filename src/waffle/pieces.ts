// Waffle parts as CutForge pieces (WAFFLE_MODE.md §7): keys `w:A3`, `w:A3·2`,
// `w:base`; no panels; cut contours with their arcs given back. Everything
// after this (copies, packing, kerf, SVG/DXF) is the box designs' code.
import type { Design, P2 } from '../model/types';
import type { TaggedContour } from '../geom/types';
import type { Piece } from '../model/pieces';
import { registerWaffle } from '../model/pieces';
import { polygonContour } from '../geom/vec';
import { refitArcs } from '../geom/arcfit';
import { kernelNow } from '../sculpt/kernel';
import { fontsVersion } from '../text/fonts';
import { snapCircles } from './arcs';
import { waffleChecks } from './checks';
import { deriveWaffle, type Poly } from './derive';
import { finishParts, labelParts, type CutPart, type Finished } from './finish';

/** A closed ring as a cut contour: circles snapped, arcs given back. */
export function ringContour(r: Poly): TaggedContour['contour'] {
  const pts: P2[] = snapCircles(r.map(([x, y]) => ({ x, y })));
  return refitArcs(polygonContour(pts));
}

export type WaffleResult = Finished & { pieces: Piece[] };
const memo = new WeakMap<object, Map<string, Finished>>();
const pieceMemo = new WeakMap<Finished, Map<number, WaffleResult>>();

/** The design's waffle parts, slotted (and with tabs), and the problems found: what the stage and the checks need. */
export function waffleParts(d: Design): Finished {
  const k = kernelNow();
  if (!k || d.kind !== 'waffle') return { parts: [], crossings: [], problems: [], plate: null };
  const holder = (d.sculpt ?? d) as object;
  const key = JSON.stringify([d.waffle ?? null, d.material]);
  let m = memo.get(holder);
  if (!m) memo.set(holder, (m = new Map()));
  const hit = m.get(key);
  if (hit) return hit;
  const fin = finishParts(k, d, deriveWaffle(k, d));
  m.clear();
  m.set(key, fin);
  return fin;
}

/** The parts with their labels, as pieces to cut (the cut plan and the export). */
export function waffleResult(d: Design): WaffleResult {
  const fin = waffleParts(d);
  const k = kernelNow();
  if (!k || d.kind !== 'waffle') return { ...fin, pieces: [] };
  // the labels' font arrives in the background: its version is part of the key
  let pm = pieceMemo.get(fin);
  if (!pm) pieceMemo.set(fin, (pm = new Map()));
  const fv = fontsVersion();
  const done = pm.get(fv);
  if (done) return done;
  const labelled = labelParts(deriveWaffle(k, d), fin);
  const parts: CutPart[] = labelled.parts;
  // corrugated: the flutes run up the slice; a sheet whose flutes run along x gets the parts turned
  const turn = d.material.kind === 'corrugated' && d.material.grain === 'x';
  const pieces: Piece[] = parts.map((p) => {
    const rot = (r: Poly): Poly => (turn ? r.map(([x, y]) => [y, -x]) : r);
    const contours: TaggedContour[] = p.polys.map((r, i) => ({ op: 'cut', role: i === 0 ? 'outer' : 'hole', contour: ringContour(rot(r)), ref: { pieceKey: p.key } }));
    for (const e of p.engrave) contours.push({ ...e, contour: turn ? rotC(e.contour) : e.contour });
    return { key: p.key, panels: [], contours };
  });
  if (labelled.plate) {
    // the base plate is cut as it lies, seen from above
    const pl = labelled.plate;
    const contours: TaggedContour[] = pl.polys.map((r, i) => ({ op: 'cut', role: i === 0 ? 'outer' : 'hole', contour: ringContour(r), ref: { pieceKey: pl.key } }));
    pieces.unshift({ key: pl.key, panels: [], contours: [...contours, ...pl.engrave] });
  }
  const res: WaffleResult = { ...labelled, pieces };
  pm.clear();
  pm.set(fv, res);
  return res;
}
function rotC(c: TaggedContour['contour']): TaggedContour['contour'] {
  const R = (p: P2) => ({ x: p.y, y: -p.x });
  return { closed: c.closed, segs: c.segs.map((s) => (s.k === 'L' ? { k: 'L', a: R(s.a), b: R(s.b) } : { ...s, a: R(s.a), b: R(s.b), c: R(s.c) })) };
}

export function wafflePieces(d: Design): Piece[] {
  return waffleResult(d).pieces;
}

/** The slice a piece belongs to (for selection across the cut plan and the stage). */
export function partOf(d: Design, pieceKey: string) {
  const p = waffleParts(d).parts.find((x) => x.key === pieceKey);
  return p ? { fam: p.fam, sliceId: p.sliceId, label: p.label } : null;
}

registerWaffle({ pieces: wafflePieces, partOf, checks: (d) => waffleChecks(d, kernelNow() ? waffleParts(d) : null) });
