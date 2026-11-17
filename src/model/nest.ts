// Nesting by true shape (milestone 69, PACKAGING_PLAN.md §9.2).
//
// Each piece becomes a bitmap of cells (any cell its outline touches, grown by
// half the part spacing), tried at 0° and 180°, and at 90° and 270° when the
// material has no grain or the student allowed turning. Pieces go in largest
// first, each at the highest place it fits (the sheet fills from its top-left,
// as the bounding-box packer does), then furthest left. Pieces are never
// mirrored: scores and engraving belong to one face. Two masks that share no
// cell are at least the spacing apart, so nested pieces never come closer than
// the spacing (and never into the margin).
//
// The result is stored as placements (`nested`, with the piece's size): kept
// like manual moves while the piece keeps its size; a piece that changed size
// goes back to the bounding-box packer until the student nests again.
import type { Design, SheetPlacement } from './types';
import type { Contour } from '../geom/types';
import { applyX, contourArea, flattenContour } from '../geom/vec';
import { profileOf } from './materials';
import { nestSize as sizeOf, pack, pieceCopies, placementXform, sheetCount, type PieceCopy } from './pack';

type Rot = 0 | 90 | 180 | 270;
/** A mask: per row (from `r0`), the runs of covered cells as [from, to] column pairs (from `c0`). */
type Mask = { rows: [number, number][][]; r0: number; order: number[] };

/** The cell size (mm) for a sheet: about 200 000 cells, never finer than 1 mm. */
export function cellSize(W: number, H: number): number {
  return Math.max(1, Math.ceil(Math.sqrt((W * H) / 200_000) * 2) / 2);
}

/** A piece's outline points turned to `rot`, its bounding box starting at (0, 0). */
function outlines(c: PieceCopy, rot: Rot): { x: number; y: number }[][] {
  const xf = placementXform({ sheet: 0, x: 0, y: 0, rot, manual: false }, c.h, c.w);
  return c.contours.filter((t) => t.role === 'outer').map((t) => flattenContour(t.contour as Contour, 0.2).map((q) => applyX(xf, q)));
}

/** Rasterise outlines on a grid of cell `s` (origin at the piece's box corner), grown by `k` cells. */
function maskOf(polys: { x: number; y: number }[][], s: number, k: number): Mask {
  const cells = new Set<number>();
  const W = 1 << 15; // columns per row in the set's key (offset so negatives fit)
  const key = (i: number, j: number) => (j + 64) * W + (i + 64);
  // the cells the outline crosses
  for (const pts of polys)
    for (let n = 0; n < pts.length; n++) {
      const a = pts[n], b = pts[(n + 1) % pts.length];
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (s / 4)));
      for (let t = 0; t <= steps; t++) {
        const x = a.x + ((b.x - a.x) * t) / steps, y = a.y + ((b.y - a.y) * t) / steps;
        cells.add(key(Math.floor(x / s), Math.floor(y / s)));
      }
    }
  // the cells whose centre is inside (even-odd over every outline)
  let maxY = 0;
  for (const pts of polys) for (const q of pts) maxY = Math.max(maxY, q.y);
  const rowsN = Math.ceil(maxY / s) + 1;
  for (let j = 0; j < rowsN; j++) {
    const y = (j + 0.5) * s;
    const xs: number[] = [];
    for (const pts of polys)
      for (let n = 0; n < pts.length; n++) {
        const a = pts[n], b = pts[(n + 1) % pts.length];
        if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) xs.push(a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
    xs.sort((p, q) => p - q);
    for (let n = 0; n + 1 < xs.length; n += 2) {
      for (let i = Math.ceil(xs[n] / s - 0.5); i + 0.5 <= xs[n + 1] / s; i++) cells.add(key(i, j));
    }
  }
  // grown by k cells (a square: every point within k cells along each axis)
  const byRow = new Map<number, number[]>();
  for (const kk of cells) {
    const j = Math.floor(kk / W) - 64, i = (kk % W) - 64;
    for (let dj = -k; dj <= k; dj++) {
      const row = byRow.get(j + dj) ?? [];
      row.push(i - k, i + k);
      byRow.set(j + dj, row);
    }
  }
  const js = [...byRow.keys()].sort((p, q) => p - q);
  const r0 = js[0] ?? 0;
  const rows: [number, number][][] = [];
  for (let j = r0; j <= (js[js.length - 1] ?? -1); j++) {
    const raw = byRow.get(j) ?? [];
    const iv: [number, number][] = [];
    for (let n = 0; n < raw.length; n += 2) iv.push([raw[n], raw[n + 1]]);
    iv.sort((p, q) => p[0] - q[0]);
    const merged: [number, number][] = [];
    for (const r of iv) {
      const last = merged[merged.length - 1];
      if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]);
      else merged.push([r[0], r[1]]);
    }
    rows.push(merged);
  }
  // the widest rows are checked first: they are the likeliest to collide
  const order = rows.map((_, n) => n).sort((p, q) => width(rows[q]) - width(rows[p]));
  return { rows, r0, order };
}
const width = (row: [number, number][]) => row.reduce((s, r) => s + r[1] - r[0] + 1, 0);

/** One sheet's cells: taken or free, with the free run starting at each cell. */
class Grid {
  taken: Uint8Array;
  run: Int32Array;
  constructor(
    public nx: number,
    public ny: number,
  ) {
    this.taken = new Uint8Array(nx * ny);
    this.run = new Int32Array(nx * ny);
    for (let j = 0; j < ny; j++) this.fixRow(j);
  }
  fixRow(j: number) {
    let r = 0;
    for (let i = this.nx - 1; i >= 0; i--) {
      r = this.taken[j * this.nx + i] ? 0 : r + 1;
      this.run[j * this.nx + i] = r;
    }
  }
  /** 0 when the mask fits at (ox, oy); else the next column worth trying. */
  test(m: Mask, ox: number, oy: number): number {
    for (const n of m.order) {
      const j = oy + m.r0 + n;
      if (j < 0 || j >= this.ny) continue;
      for (const [a, b] of m.rows[n]) {
        const from = Math.max(0, ox + a), to = Math.min(this.nx - 1, ox + b);
        if (from > to) continue;
        const free = this.run[j * this.nx + from];
        if (free < to - from + 1) return Math.max(ox + 1, from + free + 1 - a);
      }
    }
    return 0;
  }
  put(m: Mask, ox: number, oy: number) {
    for (let n = 0; n < m.rows.length; n++) {
      const j = oy + m.r0 + n;
      if (j < 0 || j >= this.ny) continue;
      for (const [a, b] of m.rows[n]) for (let i = Math.max(0, ox + a); i <= Math.min(this.nx - 1, ox + b); i++) this.taken[j * this.nx + i] = 1;
      this.fixRow(j);
    }
  }
}

/**
 * Nest every piece copy by its true shape. Manual moves the student made are
 * kept; earlier nesting is redone. Never takes more sheets than the
 * bounding-box packer: where it would, the packer's layout is returned.
 */
export function nest(d: Design, copies = pieceCopies(d)): Record<string, SheetPlacement> {
  const kept = (c: PieceCopy) => {
    const p = d.placements[c.key];
    return p?.manual && !p.nested ? p : undefined;
  };
  const out: Record<string, SheetPlacement> = {};
  const mats = [...new Set(copies.map((c) => c.mat))];
  for (const id of mats) {
    const matId = id === d.material.id ? undefined : id;
    Object.assign(out, nestOne(d, copies.filter((c) => c.mat === id), matId, kept));
  }
  // never worse than the box packer (its layout with the student's moves kept)
  const plain = { ...d, placements: Object.fromEntries(Object.entries(d.placements).filter(([, p]) => p.manual && !p.nested)) };
  const boxes = pack(plain, copies);
  for (const id of mats) {
    const matId = id === d.material.id ? undefined : id;
    const mine = (p: SheetPlacement) => (p.mat ?? undefined) === matId;
    const n = (pl: Record<string, SheetPlacement>) => sheetCount(Object.fromEntries(Object.entries(pl).filter(([, p]) => mine(p))));
    if (n(out) > n(boxes)) for (const c of copies) if (c.mat === id) out[c.key] = boxes[c.key];
  }
  return out;
}

function nestOne(d: Design, copies: PieceCopy[], matId: string | undefined, kept: (c: PieceCopy) => SheetPlacement | undefined): Record<string, SheetPlacement> {
  const area = (c: PieceCopy) => c.contours.filter((t) => t.role === 'outer').reduce((a, t) => a + Math.abs(contourArea(t.contour as Contour)), 0);
  const tie = (a: PieceCopy, b: PieceCopy) => (a.key < b.key ? -1 : 1);
  const free = copies.filter((c) => !kept(c));
  // a few orders (largest area, longest side, tallest), the best layout kept: fewest sheets, then the least of the last one
  const orders = [
    [...free].sort((a, b) => area(b) - area(a) || Math.max(b.w, b.h) - Math.max(a.w, a.h) || tie(a, b)),
    [...free].sort((a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h) || area(b) - area(a) || tie(a, b)),
    [...free].sort((a, b) => Math.min(b.w, b.h) - Math.min(a.w, a.h) || area(b) - area(a) || tie(a, b)),
  ];
  const masks = new Map<string, Mask>();
  let best: { out: Record<string, SheetPlacement>; sheets: number; low: number } | null = null;
  const seen = new Set<string>();
  for (const order of orders) {
    const k = order.map((c) => c.key).join(',');
    if (seen.has(k)) continue;
    seen.add(k);
    // each piece at its highest place, choosing the turn that sits highest, or the one that reaches least far right
    for (const how of ['high', 'narrow'] as const) {
      const r = nestRun(d, copies, order, matId, kept, masks, how);
      if (!best || r.sheets < best.sheets || (r.sheets === best.sheets && r.low > best.low + 1e-6)) best = r;
    }
  }
  return best!.out;
}

/** One nesting pass in a given order: placements, sheets used, and how high the last sheet's lowest piece sits. */
function nestRun(d: Design, copies: PieceCopy[], todo: PieceCopy[], matId: string | undefined, kept: (c: PieceCopy) => SheetPlacement | undefined, masks: Map<string, Mask>, how: 'high' | 'narrow') {
  const mat = profileOf(d, matId);
  const { sheetW: W, sheetH: H } = mat;
  const m = d.sheetMargin, s = cellSize(W, H);
  const k = Math.ceil((d.sheetSpacing / 2 + s / 4) / s);
  const nx = Math.ceil(W / s), ny = Math.ceil(H / s);
  const turn = mat.grain === 'none' || !!d.allowRotate;
  const rots: Rot[] = turn ? [0, 90, 180, 270] : [0, 180];
  const grids: Grid[] = [];
  const grid = (n: number) => {
    while (grids.length <= n) grids.push(new Grid(nx, ny));
    return grids[n];
  };
  const out: Record<string, SheetPlacement> = {};
  // the student's own moves first, where they are
  for (const c of copies) {
    const p = kept(c);
    if (!p) continue;
    out[c.key] = p;
    // a manual move sits anywhere: its mask on the grid from its own corner (rounded down: the grown mask covers the rest)
    const offX = p.x / s - Math.floor(p.x / s), offY = p.y / s - Math.floor(p.y / s);
    const polys = outlines(c, p.rot as Rot).map((pts) => pts.map((q) => ({ x: q.x + offX * s, y: q.y + offY * s })));
    grid(p.sheet).put(maskOf(polys, s, k), Math.floor(p.x / s), Math.floor(p.y / s));
  }
  // one mask per piece and turn (copies share theirs)
  const maskFor = (c: PieceCopy, r: Rot) => {
    const key = `${c.pieceKey}@${r}`;
    let mk = masks.get(key);
    if (!mk) masks.set(key, (mk = maskOf(outlines(c, r), s, k)));
    return mk;
  };
  let low = H;
  for (const c of todo) {
    let best: { sheet: number; ox: number; oy: number; rot: Rot; right: number } | null = null;
    const beats = (oy: number, ox: number, right: number) =>
      !best || (how === 'high' ? oy > best.oy || (oy === best.oy && ox < best.ox) : right < best.right - 1e-6 || (Math.abs(right - best.right) <= 1e-6 && oy > best.oy));
    // the sheets in use, then one new sheet
    const last = grids.length;
    for (let sheet = 0; sheet <= last && !best; sheet++) {
      const g = grid(sheet);
      for (const rot of rots) {
        const [w, h] = rot === 90 || rot === 270 ? [c.h, c.w] : [c.w, c.h];
        const x0 = Math.ceil(m / s - 1e-9), x1 = Math.floor((W - m - w) / s + 1e-9);
        const y0 = Math.ceil(m / s - 1e-9), y1 = Math.floor((H - m - h) / s + 1e-9);
        if (x1 < x0 || y1 < y0) continue;
        const mk = maskFor(c, rot);
        // from the top down: the first row it fits in is its highest place (a lower one never beats a found one)
        for (let oy = y1; oy >= y0 && !(how === 'high' && best && best.sheet === sheet && oy < best.oy); oy--) {
          let ox = x0;
          while (ox <= x1) {
            const next = g.test(mk, ox, oy);
            if (!next) break;
            ox = next;
          }
          if (ox > x1) continue;
          const right = ox * s + w;
          if (beats(oy, ox, right)) best = { sheet, ox, oy, rot, right };
          break;
        }
      }
    }
    if (!best) {
      // fits no sheet at any turn: on a sheet of its own at the margin (validation reports it)
      const sheet = grids.length;
      grid(sheet).put(maskFor(c, 0), Math.ceil(m / s), Math.ceil(m / s));
      out[c.key] = { sheet, x: m, y: m, rot: 0, manual: true, nested: sizeOf(c), ...(matId ? { mat: matId } : {}) };
      continue;
    }
    grid(best.sheet).put(maskFor(c, best.rot), best.ox, best.oy);
    out[c.key] = { sheet: best.sheet, x: best.ox * s, y: best.oy * s, rot: best.rot, manual: true, nested: sizeOf(c), ...(matId ? { mat: matId } : {}) };
  }
  const sheets = Math.max(0, ...Object.values(out).map((p) => p.sheet)) + 1;
  for (const p of Object.values(out)) if (p.sheet === sheets - 1) low = Math.min(low, p.y);
  return { out, sheets, low };
}
