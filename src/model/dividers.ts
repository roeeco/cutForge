// Divider sets (milestone 18): dividers made and spaced automatically in a
// base's rectangular clear inside, kept as a set so that changing a count or
// the box re-spaces them. Reconciled in `solve` like tray walls: members have
// stable ids (`<set>/a<n>`, `<set>/l<n>`), and only their offsets and heights
// are written; their joints come from the ordinary seam code.
import type { Connection, ConnectionKind, Design, DividerSet, Panel } from './types';
import { findEdge, isRectSketch } from './edges';
import { edgeLength } from './frame';

export const MIN_COMPARTMENT = 5;

/** The clear inside of a rectangular base between the walls on its edges (base-local), or null. */
export function clearBox(d: Design, baseId: string): { x0: number; x1: number; y0: number; y1: number } | null {
  const base = d.panels[baseId];
  if (!base || !isRectSketch(base)) return null;
  const t = d.material.thickness;
  const inner = (key: string) => {
    // a wall at the edge (not a divider standing in from it)
    const c = Object.values(d.connections).find((x) => x.grown && x.a.panelId === baseId && x.a.edge === key && Math.abs(x.angle - 90) < 1e-6 && x.dir === 'up' && x.offset <= Math.max(t, 6) + 1e-6 && !memberOf(d, x.b.panelId));
    return c ? c.offset + t : 0;
  };
  return { x0: inner('e3'), x1: base.w - inner('e1'), y0: inner('e0'), y1: base.h - inner('e2') };
}

/** Slab starts (offsets from the edge) for n dividers of thickness t in [lo, hi]. */
export function spacedOffsets(lo: number, hi: number, n: number, t: number, mode: DividerSet['mode'] = 'even', size?: number): number[] {
  if (mode === 'size' && size && size > 0) {
    // as many compartments of `size` as fit while the last one keeps at least MIN_COMPARTMENT
    const m = Math.max(0, Math.floor((hi - lo - MIN_COMPARTMENT) / (size + t) + 1e-9));
    return Array.from({ length: m }, (_, k) => lo + (k + 1) * size + k * t);
  }
  if (n <= 0) return [];
  const c = (hi - lo - n * t) / (n + 1);
  return Array.from({ length: n }, (_, k) => lo + (k + 1) * c + k * t);
}

/** The set a divider belongs to, with its axis and index. */
export function memberOf(d: Design, panelId: string): { set: DividerSet; axis: 'a' | 'l'; n: number } | null {
  const m = /^(.*)\/([al])(\d+)$/.exec(panelId);
  if (!m) return null;
  const set = d.dividerSets?.[m[1]];
  return set ? { set, axis: m[2] as 'a' | 'l', n: Number(m[3]) } : null;
}

const edgeOf = (axis: 'a' | 'l') => (axis === 'a' ? 'e3' : 'e0');
const kindFor = (d: Design): ConnectionKind => (d.material.kind === 'plywood' ? 'tabslot' : 'butt');

/** Offsets of each axis's members, as the set wants them now. */
export function setOffsets(d: Design, set: DividerSet): { a: number[]; l: number[] } | null {
  const box = clearBox(d, set.baseId);
  if (!box) return null;
  const t = d.material.thickness;
  return {
    a: set.across > 0 || set.mode === 'even' ? spacedOffsets(box.x0, box.x1, set.across, t, set.across > 0 ? set.mode : 'even', set.size) : [],
    l: set.along > 0 || set.mode === 'even' ? spacedOffsets(box.y0, box.y1, set.along, t, set.along > 0 ? set.mode : 'even', set.size) : [],
  };
}

function removePanel(d: Design, id: string) {
  for (const c of Object.values(d.connections)) if (c.a.panelId === id || c.b.panelId === id) delete d.connections[c.id];
  delete d.panels[id];
  delete d.pieces[id];
  d.order = d.order.filter((x) => x !== id);
}

/** Make, place and remove set members (run by `solve`, before frames are derived). */
export function reconcileDividerSets(d: Design) {
  for (const set of Object.values(d.dividerSets ?? {})) {
    const base = d.panels[set.baseId];
    if (!base) {
      delete d.dividerSets![set.id];
      continue;
    }
    set.loose = (set.loose ?? []).filter((id) => d.panels[id]);
    const offs = setOffsets(d, set);
    if (!offs) continue; // not a rectangle any more: the members stay where they are
    for (const axis of ['a', 'l'] as const) {
      const list = offs[axis];
      const edge = edgeOf(axis);
      if (!findEdge(base, edge)) continue;
      list.forEach((off, i) => {
        const id = `${set.id}/${axis}${i + 1}`, cid = `${set.id}/c/${axis}${i + 1}`;
        if (!d.panels[id]) {
          const p: Panel = { id, name: `${d.order.length + 1}`, w: edgeLength(base, edge), h: set.height, sketch: { kind: 'wall' }, frame: base.frame, details: [] };
          d.panels[id] = p;
          d.order.push(id);
          d.pieces[id] = { quantity: 1 };
        }
        const kind = kindFor(d);
        if (!d.connections[cid]) {
          const c: Connection = { id: cid, kind, pref: kind, a: { panelId: base.id, edge }, b: { panelId: id, edge: 'e0' }, grown: true, angle: 90, dir: 'up', offset: off, fingers: null, tabs: null, flap: null, foldDir: 'valley' };
          d.connections[cid] = c;
        }
        d.connections[cid].offset = Math.max(0.5, off);
        d.panels[id].h = Math.max(5, set.height);
      });
      // members past the count go
      for (const id of [...d.order]) {
        const m = memberOf(d, id);
        if (m && m.set.id === set.id && m.axis === axis && m.n > list.length) removePanel(d, id);
      }
    }
  }
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
  }
  if (d.noAutoSeams) d.noAutoSeams = d.noAutoSeams.map((k) => k.split('|').map((x) => (x === from ? to : x)).sort().join('|'));
  // a set member's own grown connection id follows (`<set>/c/<axis><n>`)
  const fm = /^(.*)\/([al])(\d+)$/.exec(from), tm = /^(.*)\/([al])(\d+)$/.exec(to);
  for (const c of Object.values(d.connections)) {
    if (!c.grown || c.b.panelId !== to) continue;
    const want = tm ? `${tm[1]}/c/${tm[2]}${tm[3]}` : fm && c.id === `${fm[1]}/c/${fm[2]}${fm[3]}` ? `${to}/c` : c.id;
    if (want !== c.id && !d.connections[want]) {
      delete d.connections[c.id];
      c.id = want;
      d.connections[want] = c;
    }
  }
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
