// Dividers (milestone 32: one manual way, `addDividerBetween` in ops): the
// clear inside of a rectangular base, even spacing, and snapping a dragged
// divider to equal compartments.
import type { Design } from './types';
import { isRectSketch } from './edges';
import { tOf } from './materials';

export const MIN_COMPARTMENT = 5;

/** The clear inside of a rectangular base between the walls on its edges (base-local), or null. */
export function clearBox(d: Design, baseId: string): { x0: number; x1: number; y0: number; y1: number } | null {
  const base = d.panels[baseId];
  if (!base || !isRectSketch(base)) return null;
  const t = tOf(d, baseId);
  const inner = (key: string) => {
    // a wall at the edge (not a divider standing in from it)
    const c = Object.values(d.connections).find((x) => x.grown && x.a.panelId === baseId && x.a.edge === key && Math.abs(x.angle - 90) < 1e-6 && x.dir === 'up' && x.offset <= Math.max(t, 6) + 1e-6 );
    return c ? c.offset + t : 0;
  };
  return { x0: inner('e3'), x1: base.w - inner('e1'), y0: inner('e0'), y1: base.h - inner('e2') };
}

/** Slab starts (offsets from the edge) for n dividers of thickness t in [lo, hi]. */
export function spacedOffsets(lo: number, hi: number, n: number, t: number, mode: 'even' | 'size' = 'even', size?: number): number[] {
  if (mode === 'size' && size && size > 0) {
    // as many compartments of `size` as fit while the last one keeps at least MIN_COMPARTMENT
    const m = Math.max(0, Math.floor((hi - lo - MIN_COMPARTMENT) / (size + t) + 1e-9));
    return Array.from({ length: m }, (_, k) => lo + (k + 1) * size + k * t);
  }
  if (n <= 0) return [];
  const c = (hi - lo - n * t) / (n + 1);
  return Array.from({ length: n }, (_, k) => lo + (k + 1) * c + k * t);
}

/** Rename a panel everywhere it is referred to. */
export function renamePanel(d: Design, from: string, to: string) {
  const p = d.panels[from];
  if (!p || d.panels[to]) return;
  delete d.panels[from];
  p.id = to;
  d.panels[to] = p;
  d.order = d.order.map((x) => (x === from ? to : x));
  if (d.pieces[from]) {
    d.pieces[to] = d.pieces[from];
    delete d.pieces[from];
  }
  for (const k of Object.keys(d.placements)) {
    const [key, rest] = k.split('#');
    if (key === from || key.startsWith(from + '~')) {
      d.placements[`${to}${key.slice(from.length)}#${rest}`] = d.placements[k];
      delete d.placements[k];
    }
  }
  for (const c of Object.values(d.connections)) {
    if (c.a.panelId === from) c.a.panelId = to;
    if (c.b.panelId === from) c.b.panelId = to;
    if (c.geom) for (const list of [c.geom.edges, c.geom.holes, c.geom.adds, c.geom.scores, c.geom.flaps3d, c.geom.cuts ?? []] as { panelId: string }[][]) for (const x of list) if (x.panelId === from) x.panelId = to;
    for (const f of c.geom?.flaps3d ?? []) if (f.owner === from) f.owner = to;
  }
  if (d.noAutoSeams) d.noAutoSeams = d.noAutoSeams.map((k) => k.split('|').map((x) => (x === from ? to : x)).sort().join('|'));
}

/** Snap a divider's offset: equal compartments either side, even spacing of the whole row, or a neighbouring compartment's width. */
export function snapDividerOffset(row: { lo: number; hi: number; others: number[] }, off: number, t: number, tol: number): number | null {
  const ends = [row.lo, ...row.others.map((o) => o + t)].filter((x) => off + 1e-9 >= x).sort((a, b) => b - a);
  const starts = [row.hi, ...row.others].filter((st) => st >= off + t - 1e-9).sort((a, b) => a - b);
  const L = ends[0] ?? row.lo, R = starts[0] ?? row.hi;
  const cands: number[] = [(L + R - t) / 2];
  const n = row.others.length + 1;
  const c = (row.hi - row.lo - n * t) / (n + 1);
  for (let k = 0; k < n; k++) cands.push(row.lo + (k + 1) * c + k * t);
  // a neighbouring compartment's width, repeated
  const L2 = [row.lo, ...row.others.map((o) => o + t)].filter((x) => L - 1e-9 > x).sort((a, b) => b - a)[0];
  if (L2 !== undefined) cands.push(L + (L - t - L2));
  const R2 = [row.hi, ...row.others].filter((st) => st > R + 1e-9).sort((a, b) => a - b)[0];
  if (R2 !== undefined) cands.push(R - (R2 - (R + t)) - t);
  let best: number | null = null;
  for (const x of cands) if (Math.abs(x - off) <= tol && (best === null || Math.abs(x - off) < Math.abs(best - off))) best = x;
  return best;
}
