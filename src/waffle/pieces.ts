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
import { snapCircles } from './arcs';
import { deriveWaffle, type Poly } from './derive';
import { finishParts, type CutPart } from './finish';

/** A closed ring as a cut contour: circles snapped, arcs given back. */
export function ringContour(r: Poly): TaggedContour['contour'] {
  const pts: P2[] = snapCircles(r.map(([x, y]) => ({ x, y })));
  return refitArcs(polygonContour(pts));
}

const memo = new WeakMap<object, Map<string, { pieces: Piece[]; parts: CutPart[] }>>();

/** The design's waffle parts, slotted and labelled, with the contours to cut. */
export function waffleResult(d: Design): { pieces: Piece[]; parts: CutPart[] } {
  const k = kernelNow();
  if (!k || d.kind !== 'waffle') return { pieces: [], parts: [] };
  const holder = (d.sculpt ?? d) as object;
  const key = JSON.stringify([d.waffle ?? null, d.material]);
  let m = memo.get(holder);
  if (!m) memo.set(holder, (m = new Map()));
  const hit = m.get(key);
  if (hit) return hit;
  const model = deriveWaffle(k, d);
  const parts = finishParts(k, d, model);
  // corrugated: the flutes run up the slice; a sheet whose flutes run along x gets the parts turned
  const turn = d.material.kind === 'corrugated' && d.material.grain === 'x';
  const pieces: Piece[] = parts.map((p) => {
    const rot = (r: Poly): Poly => (turn ? r.map(([x, y]) => [y, -x]) : r);
    const contours: TaggedContour[] = p.polys.map((r, i) => ({ op: 'cut', role: i === 0 ? 'outer' : 'hole', contour: ringContour(rot(r)), ref: { pieceKey: p.key } }));
    for (const e of p.engrave) contours.push({ ...e, contour: turn ? rotC(e.contour) : e.contour });
    return { key: p.key, panels: [], contours };
  });
  const r = { pieces, parts };
  m.clear();
  m.set(key, r);
  return r;
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
  const p = waffleResult(d).parts.find((x) => x.key === pieceKey);
  return p ? { fam: p.fam, sliceId: p.sliceId, label: p.label } : null;
}

registerWaffle({ pieces: wafflePieces, partOf });
