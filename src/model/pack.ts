// Sheet layout: bounding-box shelf packing with optional 90° rotation.
import type { Design, MaterialProfile, SheetPlacement } from './types';
import { profileOf } from './materials';
import type { TaggedContour, Xform2 } from '../geom/types';
import { contourBBox, xformContour } from '../geom/vec';
import { buildPieces, pieceKeyOf, pieceMat, pieceRoot, type NetPanel } from './pieces';

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
  /** The material it is cut from (a profile id; the working material's id for boards without their own). */
  mat: string;
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
    const q = quantityOf(d, pieceRoot(piece.key));
    for (let i = 0; i < q; i++)
      out.push({ key: `${piece.key}#${i}`, pieceKey: piece.key, copy: i, contours, w: maxX - minX, h: maxY - minY, origin: { x: minX, y: minY }, panels: piece.panels, frag: piece.frag, mat: pieceMat(d, piece.key) });
  }
  return out;
}

/** How many copies of a piece: its own setting, or for a part cut off a net (milestone 69) the net's. */
export function quantityOf(d: Design, root: string): number {
  return Math.max(1, d.pieces[quantityRoot(d, root)]?.quantity ?? 1);
}

/** The piece whose setting says how many copies a piece is cut (itself, or the net a part was cut off). */
export function quantityRoot(d: Design, root: string): string {
  let id = root;
  for (let i = 0; i < 50; i++) {
    const c = Object.values(d.connections).find((x) => x.split && x.b.panelId === id);
    if (!c) break;
    id = pieceKeyOf(d, c.a.panelId);
  }
  return id;
}

/** A piece's size as the nester records it. */
export const nestSize = (c: Pick<PieceCopy, 'w' | 'h'>) => ({ w: Math.round(c.w * 100) / 100, h: Math.round(c.h * 100) / 100 });

/** Is a placement still good for this piece: any but a nested one, which holds while the piece keeps its size (milestone 69)? */
export function nestHolds(p: SheetPlacement, c: Pick<PieceCopy, 'w' | 'h'>): boolean {
  if (!p.nested) return true;
  const s = nestSize(c);
  return Math.abs(p.nested.w - s.w) < 0.011 && Math.abs(p.nested.h - s.h) < 0.011;
}

/** Transform from piece-local (bbox at origin) coordinates to sheet coordinates. */
export function placementXform(p: SheetPlacement, pieceH: number, pieceW = 0): Xform2 {
  // turned CCW about the origin, then shifted so the bbox starts at (x, y)
  if (p.rot === 90) return { tx: p.x + pieceH, ty: p.y, rot: Math.PI / 2 };
  if (p.rot === 180) return { tx: p.x + pieceW, ty: p.y + pieceH, rot: Math.PI };
  if (p.rot === 270) return { tx: p.x, ty: p.y + pieceW, rot: -Math.PI / 2 };
  return { tx: p.x, ty: p.y, rot: 0 };
}

type Rect = { sheet: number; x0: number; y0: number; x1: number; y1: number };

/** Footprint of a placed copy on its sheet (bounding box). */
export function placedRect(p: SheetPlacement, w: number, h: number): Rect {
  const [ww, hh] = p.rot === 90 || p.rot === 270 ? [h, w] : [w, h];
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
  // each material on its own sheets (milestone 36): the working material's placements name no material
  const mats = [...new Set(copies.map((c) => c.mat))];
  if (mats.length <= 1 && (!mats.length || mats[0] === d.material.id)) return packOne(d, d.material, copies, undefined);
  const out: Record<string, SheetPlacement> = {};
  for (const id of mats) Object.assign(out, packOne(d, profileOf(d, id), copies.filter((c) => c.mat === id), id === d.material.id ? undefined : id));
  return out;
}

/** The materials a layout uses, the working material first, with their sheet counts. */
export function sheetGroups(d: Design, placements: Record<string, SheetPlacement>): { mat: string; profile: MaterialProfile; sheets: number }[] {
  const n = new Map<string, number>([[d.material.id, 0]]);
  for (const p of Object.values(placements)) {
    const k = p.mat ?? d.material.id;
    n.set(k, Math.max(n.get(k) ?? 0, p.sheet + 1));
  }
  const out = [...n].map(([mat, sheets]) => ({ mat, profile: profileOf(d, mat), sheets: Math.max(1, sheets) }));
  // a design of other materials only: no empty working-material sheet
  return out.length > 1 && !Object.values(placements).some((p) => !p.mat) ? out.slice(1) : out;
}

function packOne(d: Design, mat: MaterialProfile, copies: PieceCopy[], matId: string | undefined): Record<string, SheetPlacement> {
  const { sheetW, sheetH, grain } = mat;
  const m = d.sheetMargin, gap = d.sheetSpacing;
  const canRotate = grain === 'none' || !!d.allowRotate;
  const result: Record<string, SheetPlacement> = {};
  const occupied: Rect[] = [];
  for (const c of copies) {
    const mp = d.placements[c.key];
    // a manual move stays on its own material's sheets (a board switched material is placed again)
    if (mp?.manual && (mp.mat ?? undefined) === matId && nestHolds(mp, c)) {
      result[c.key] = mp;
      occupied.push(placedRect(mp, c.w, c.h));
    }
  }
  const auto = copies.filter((c) => !result[c.key]);
  auto.sort((a, b) => b.w * b.h - a.w * a.h || Math.max(b.w, b.h) - Math.max(a.w, a.h));
  const free = (sheet: number, x: number, y: number, w: number, h: number) => {
    if (x < m - 1e-9 || y < m - 1e-9 || x + w > sheetW - m + 1e-9 || y + h > sheetH - m + 1e-9) return false;
    return !occupied.some((r) => r.sheet === sheet && x < r.x1 + gap - 1e-9 && x + w > r.x0 - gap + 1e-9 && y < r.y1 + gap - 1e-9 && y + h > r.y0 - gap + 1e-9);
  };
  // nothing placed yet: a piece that fits nowhere goes on sheet 0, not on a second sheet after an empty one (BUGFIX_PLAN B16)
  let lastSheet = occupied.length ? Math.max(...occupied.map((r) => r.sheet)) : -1;
  for (const c of auto) {
    const orients: [number, number, 0 | 90][] = [[c.w, c.h, 0]];
    if (canRotate && Math.abs(c.w - c.h) > 1e-9) orients.push([c.h, c.w, 90]);
    let placed: SheetPlacement | null = null;
    for (let sheet = 0; sheet <= Math.max(0, lastSheet + 1) && !placed; sheet++) {
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
      if (best) placed = { sheet, x: best.x, y: best.y, rot: best.rot, manual: false, ...(matId ? { mat: matId } : {}) };
    }
    if (!placed) {
      // does not fit an empty sheet: put it on a new sheet at the margin; validation flags it
      lastSheet++;
      placed = { sheet: lastSheet, x: m, y: m, rot: 0, manual: false, ...(matId ? { mat: matId } : {}) };
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
  const copies = pieceCopies(d);
  const c = copies.find((x) => x.key === key);
  if (c && profileOf(d, c.mat).grain !== 'none' && !d.allowRotate) return false;
  const p = pack(d, copies)[key];
  if (!c || !p) return false;
  const r0 = placedRect(p, c.w, c.h);
  const rot: 0 | 90 = p.rot === 90 || p.rot === 270 ? 0 : 90;
  const r1 = placedRect({ ...p, rot }, c.w, c.h);
  d.placements[key] = { sheet: p.sheet, x: p.x, y: r0.y1 - (r1.y1 - r1.y0), rot, manual: true, ...(p.mat ? { mat: p.mat } : {}) };
  return true;
}
