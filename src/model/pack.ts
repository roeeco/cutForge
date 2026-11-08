// Sheet layout: bounding-box shelf packing with optional 90° rotation.
import type { Design, SheetPlacement } from './types';
import type { TaggedContour, Xform2 } from '../geom/types';
import { contourBBox, xformContour } from '../geom/vec';
import { buildPieces, pieceRoot, type NetPanel } from './pieces';

export type PieceCopy = {
  key: string; // `${pieceKey}#${copy}`
  pieceKey: string;
  copy: number;
  contours: TaggedContour[]; // piece-local, bbox min at (0,0)
  w: number;
  h: number;
  /** Piece-local coordinates of the bbox minimum (subtract to get copy coordinates). */
  origin: { x: number; y: number };
  /** Panels in this piece and their panel-local -> piece-local transforms. */
  panels: NetPanel[];
  /** Fragment i of n, when cuts split the piece. */
  frag?: { i: number; n: number };
};

export function pieceCopies(d: Design): PieceCopy[] {
  const out: PieceCopy[] = [];
  for (const piece of buildPieces(d)) {
    const raw = piece.contours;
    const outers = raw.filter((c) => c.role === 'outer');
    const bbs = outers.map((c) => contourBBox(c.contour));
    const minX = Math.min(...bbs.map((b) => b.minX)), minY = Math.min(...bbs.map((b) => b.minY));
    const maxX = Math.max(...bbs.map((b) => b.maxX)), maxY = Math.max(...bbs.map((b) => b.maxY));
    const shift: Xform2 = { tx: -minX, ty: -minY, rot: 0 };
    const contours = raw.map((c) => ({ ...c, contour: xformContour(shift, c.contour) }));
    const q = Math.max(1, d.pieces[pieceRoot(piece.key)]?.quantity ?? 1);
    for (let i = 0; i < q; i++)
      out.push({ key: `${piece.key}#${i}`, pieceKey: piece.key, copy: i, contours, w: maxX - minX, h: maxY - minY, origin: { x: minX, y: minY }, panels: piece.panels, frag: piece.frag });
  }
  return out;
}

/** Transform from piece-local (bbox at origin) coordinates to sheet coordinates. */
export function placementXform(p: SheetPlacement, pieceH: number): Xform2 {
  // rot 90: rotate CCW about origin, then shift so the bbox starts at (x, y).
  return p.rot === 90 ? { tx: p.x + pieceH, ty: p.y, rot: Math.PI / 2 } : { tx: p.x, ty: p.y, rot: 0 };
}

type Rect = { sheet: number; x0: number; y0: number; x1: number; y1: number };

/** Footprint of a placed copy on its sheet (bounding box). */
export function placedRect(p: SheetPlacement, w: number, h: number): Rect {
  const [ww, hh] = p.rot === 90 ? [h, w] : [w, h];
  return { sheet: p.sheet, x0: p.x, y0: p.y, x1: p.x + ww, y1: p.y + hh };
}

/**
 * Pack all copies. Manual placements are kept exactly; every other copy is
 * placed around them, filling each sheet from the top-left (LightBurn's usual
 * origin), largest pieces first, keeping the part spacing and sheet margin.
 * Copies rotate by 90° only when the material has no grain direction or the
 * student allowed rotation against the grain.
 */
export function pack(d: Design, copies = pieceCopies(d)): Record<string, SheetPlacement> {
  const { sheetW, sheetH, grain } = d.material;
  const m = d.sheetMargin, gap = d.sheetSpacing;
  const canRotate = grain === 'none' || !!d.allowRotate;
  const result: Record<string, SheetPlacement> = {};
  const occupied: Rect[] = [];
  for (const c of copies) {
    const mp = d.placements[c.key];
    if (mp?.manual) {
      result[c.key] = mp;
      occupied.push(placedRect(mp, c.w, c.h));
    }
  }
  const auto = copies.filter((c) => !d.placements[c.key]?.manual);
  auto.sort((a, b) => b.w * b.h - a.w * a.h || Math.max(b.w, b.h) - Math.max(a.w, a.h));
  const free = (sheet: number, x: number, y: number, w: number, h: number) => {
    if (x < m - 1e-9 || y < m - 1e-9 || x + w > sheetW - m + 1e-9 || y + h > sheetH - m + 1e-9) return false;
    return !occupied.some((r) => r.sheet === sheet && x < r.x1 + gap - 1e-9 && x + w > r.x0 - gap + 1e-9 && y < r.y1 + gap - 1e-9 && y + h > r.y0 - gap + 1e-9);
  };
  let lastSheet = Math.max(0, ...occupied.map((r) => r.sheet));
  for (const c of auto) {
    const orients: [number, number, 0 | 90][] = [[c.w, c.h, 0]];
    if (canRotate && Math.abs(c.w - c.h) > 1e-9) orients.push([c.h, c.w, 90]);
    let placed: SheetPlacement | null = null;
    for (let sheet = 0; sheet <= lastSheet + 1 && !placed; sheet++) {
      let best: { x: number; y: number; rot: 0 | 90; w: number; h: number } | null = null;
      for (const [w, h, rot] of orients) {
        // candidate corners: sheet corner, right of / below existing pieces (top-left fill)
        const xs = [m, ...occupied.filter((r) => r.sheet === sheet).map((r) => r.x1 + gap)];
        const ys = [sheetH - m - h, ...occupied.filter((r) => r.sheet === sheet).map((r) => r.y0 - gap - h)];
        for (const y of ys)
          for (const x of xs) {
            if (!free(sheet, x, y, w, h)) continue;
            // prefer higher (top), then further left
            if (!best || y + h > best.y + best.h + 1e-9 || (Math.abs(y + h - best.y - best.h) < 1e-9 && x < best.x)) best = { x, y, rot, w, h };
          }
      }
      if (best) placed = { sheet, x: best.x, y: best.y, rot: best.rot, manual: false };
    }
    if (!placed) {
      // does not fit an empty sheet: put it on a new sheet at the margin; validation flags it
      lastSheet++;
      placed = { sheet: lastSheet, x: m, y: m, rot: 0, manual: false };
    }
    lastSheet = Math.max(lastSheet, placed.sheet);
    result[c.key] = placed;
    occupied.push(placedRect(placed, c.w, c.h));
  }
  return result;
}

export function sheetCount(placements: Record<string, SheetPlacement>): number {
  let n = 0;
  for (const p of Object.values(placements)) n = Math.max(n, p.sheet + 1);
  return Math.max(1, n);
}

/**
 * Turn one copy 90° on its sheet, keeping its top-left corner in place.
 * The copy becomes a manual placement. Returns false when the grain forbids it.
 */
export function rotateCopy(d: Design, key: string): boolean {
  if (d.material.grain !== 'none' && !d.allowRotate) return false;
  const copies = pieceCopies(d);
  const c = copies.find((x) => x.key === key);
  const p = pack(d, copies)[key];
  if (!c || !p) return false;
  const r0 = placedRect(p, c.w, c.h);
  const rot: 0 | 90 = p.rot === 90 ? 0 : 90;
  const r1 = placedRect({ ...p, rot }, c.w, c.h);
  d.placements[key] = { sheet: p.sheet, x: p.x, y: r0.y1 - (r1.y1 - r1.y0), rot, manual: true };
  return true;
}
