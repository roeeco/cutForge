// Sheet layout: bounding-box shelf packing with optional 90° rotation.
import type { Design, SheetPlacement } from './types';
import type { TaggedContour, Xform2 } from '../geom/types';
import { contourBBox, xformContour } from '../geom/vec';
import { buildPieces, type NetPanel } from './pieces';

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
    const q = Math.max(1, d.pieces[piece.key]?.quantity ?? 1);
    for (let i = 0; i < q; i++)
      out.push({ key: `${piece.key}#${i}`, pieceKey: piece.key, copy: i, contours, w: maxX - minX, h: maxY - minY, origin: { x: minX, y: minY }, panels: piece.panels });
  }
  return out;
}

/** Transform from piece-local (bbox at origin) coordinates to sheet coordinates. */
export function placementXform(p: SheetPlacement, pieceH: number): Xform2 {
  // rot 90: rotate CCW about origin, then shift so the bbox starts at (x, y).
  return p.rot === 90 ? { tx: p.x + pieceH, ty: p.y, rot: Math.PI / 2 } : { tx: p.x, ty: p.y, rot: 0 };
}

/**
 * Pack all copies. Manual placements are kept as they are; everything else
 * is shelf-packed around them in reading order. Rotation is only used when
 * the material has no grain direction or the piece does not fit otherwise.
 */
export function pack(d: Design, copies = pieceCopies(d)): Record<string, SheetPlacement> {
  const { sheetW, sheetH, grain } = d.material;
  const m = d.sheetMargin, gap = d.sheetSpacing;
  const result: Record<string, SheetPlacement> = {};
  const auto = copies.filter((c) => !d.placements[c.key]?.manual);
  for (const c of copies) if (d.placements[c.key]?.manual) result[c.key] = d.placements[c.key];
  auto.sort((a, b) => Math.max(b.h, b.w) - Math.max(a.h, a.w));
  let sheet = 0, x = m, y = m, shelfH = 0;
  const usableW = sheetW - 2 * m, usableH = sheetH - 2 * m;
  for (const c of auto) {
    let w = c.w, h = c.h, rot: 0 | 90 = 0;
    const fits = (ww: number, hh: number) => ww <= usableW + 1e-9 && hh <= usableH + 1e-9;
    if (!fits(w, h) || (grain === 'none' && h > w && fits(h, w))) {
      if (fits(h, w)) {
        [w, h] = [h, w];
        rot = 90;
      }
    }
    if (x + w > sheetW - m + 1e-9) {
      x = m;
      y += shelfH + gap;
      shelfH = 0;
    }
    if (y + h > sheetH - m + 1e-9 && (x > m || y > m)) {
      sheet++;
      x = m;
      y = m;
      shelfH = 0;
    }
    // Shelves run from the top of the sheet down (LightBurn's usual top-left origin).
    result[c.key] = { sheet, x, y: sheetH - y - h, rot, manual: false };
    x += w + gap;
    shelfH = Math.max(shelfH, h);
  }
  return result;
}

export function sheetCount(placements: Record<string, SheetPlacement>): number {
  let n = 0;
  for (const p of Object.values(placements)) n = Math.max(n, p.sheet + 1);
  return Math.max(1, n);
}
