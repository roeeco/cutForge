// Fold-over (double-wall) reinforcement, an edge feature of a wall
// (CORRUGATED_JOINTS.md §3, polygons-and-corrugated-agent-prompt.md §6.2).
//
// Beyond the wall's free edge, in the wall's own flat coordinates:
//   rim strip   2t + fa, with a score at each of its edges
//   liner       h − t (down to the base) or `depth` (a partial hem, ≤ 0.45h),
//               shortened by t at each end where a neighbouring wall meets
//               it (2t where that neighbour has a fold-over too)
//   lock tabs   trapezoids (sides tapered by 18% of the width) at the liner's
//               end, through slots in the base, scored at their root
// Folded, the rim makes the top of the wall and the liner lies on its inner
// face; the tabs pass through the base and fold under. The flat net needs no
// change: the extra material is drawn in the wall's own coordinates.
import type { ConnGeom, Design, FoldOver, P2, Panel } from './types';
import { edgeNeighbours, findEdge, segDir, segInward, segLength, type EdgeSeg } from './edges';
import { toLocal, toWorld } from './frame';
import { minWeb } from './materials';
import { offsetConvex } from './seams';
import { holeCuts } from './outline';
import { flattenContour } from '../geom/vec';

const parentConn = (d: Design, id: string) => Object.values(d.connections).find((c) => c.grown && c.b.panelId === id);

/** Fold-over sizes for a wall edge. */
export function foldOverDims(d: Design, p: Panel, f: FoldOver) {
  const t = d.material.thickness, fa = d.material.foldAllowance;
  const rim = 2 * t + fa;
  const full = p.h - t;
  const liner = f.depth === null ? full : Math.min(f.depth, full);
  const lockDepth = f.lockDepth ?? t + Math.max(4, 1.5 * t);
  return { t, fa, rim, liner, full, lockDepth };
}

/** Lock tab width and positions (fractions of the liner length) for a liner of length L. */
export function lockTabs(d: Design, L: number, count: number | null): { w: number; at: number[] } {
  const t = d.material.thickness;
  const w = Math.max(Math.max(4, 3 * t), Math.min(Math.max(14, 6 * t), 0.16 * L));
  const two = L >= 2 * w + 3 * Math.max(minWeb(d.material), 2 * t);
  const n = count ?? (two ? 2 : 1);
  const at = n === 1 ? [0.5] : n === 2 ? [0.3, 0.7] : Array.from({ length: n }, (_, i) => (i + 1) / (n + 1));
  return { w, at };
}

/** How much the liner gives way at each end for the walls that meet this one there. */
function linerEnds(d: Design, p: Panel, e: EdgeSeg): [number, number] {
  const t = d.material.thickness;
  const nb = edgeNeighbours(p, e.key);
  if (!nb) return [0, 0];
  const at = (side: EdgeSeg) => {
    const c = Object.values(d.connections).find((x) => !x.grown && ((x.a.panelId === p.id && findEdge(p, x.a.edge)?.key === side.key) || (x.b.panelId === p.id && findEdge(p, x.b.edge)?.key === side.key)));
    if (!c) return 0;
    const other = d.panels[c.a.panelId === p.id ? c.b.panelId : c.a.panelId];
    return other?.foldOvers?.length ? 2 * t : t;
  };
  // the edge before this one ends at its start, the one after starts at its end
  return [at(nb[0]), at(nb[1])];
}

export type FoldOverGeom = ConnGeom & {
  /** Holes in the flat liner (the wall's cuts, continued); not part of the wall's folded 3D shape. */
  linerHoles: P2[][];
  /** Folded pose, in wall-local coordinates: the liner (x0..x1 along the edge, q0..q1 inward from it), on the wall's inner face. */
  liner: { e: EdgeSeg; x0: number; x1: number; q0: number; q1: number };
  /** Lock tabs in the folded pose: x0..x1 along the edge, reaching `depth` past the liner's far end. */
  tabs: { x0: number; x1: number; depth: number }[];
};

/** Geometry a fold-over contributes (adds and scores on the wall, slots in the base, liner holes). */
export function foldOverGeom(d: Design, p: Panel, f: FoldOver): FoldOverGeom | null {
  const e = findEdge(p, f.edge);
  if (!e) return null;
  const { t, rim, liner, lockDepth } = foldOverDims(d, p, f);
  const c = d.material.clearance;
  const L = segLength(e);
  const dir = segDir(e), inw = segInward(e);
  // point at distance s along the edge, `o` outward from it (the flat net beyond the edge)
  const at = (s: number, o: number): P2 => ({ x: e.a.x + dir.x * s - inw.x * o, y: e.a.y + dir.y * s - inw.y * o });
  const [cs, ce] = linerEnds(d, p, e);
  const g: FoldOverGeom = { edges: [], holes: [], adds: [], scores: [], flaps3d: [], linerHoles: [], liner: { e, x0: cs, x1: L - ce, q0: t, q1: t + liner }, tabs: [] };
  // rim strip, then the liner (narrower where neighbours meet it)
  g.adds.push({ panelId: p.id, poly: [at(0, 0), at(L, 0), at(L, rim), at(0, rim)] });
  g.adds.push({ panelId: p.id, poly: [at(cs, rim), at(L - ce, rim), at(L - ce, rim + liner), at(cs, rim + liner)] });
  g.scores.push({ panelId: p.id, a: at(0, 0), b: at(L, 0) }, { panelId: p.id, a: at(0, rim), b: at(L, rim) });
  // the wall's cut holes continue through the liner, aligned (folding maps inward q to outward rim + q − t)
  for (const h of holeCuts(p))
    for (const contour of h.contours) {
      const pts = flattenContour(contour, 0.05);
      const mapped = pts.map((q) => {
        const s = (q.x - e.a.x) * dir.x + (q.y - e.a.y) * dir.y;
        const qi = (q.x - e.a.x) * inw.x + (q.y - e.a.y) * inw.y;
        return { s, qi, p: at(s, rim + qi - t) };
      });
      // only where the hole lies over the liner
      if (mapped.every((m) => m.qi > t && m.qi < t + liner && m.s > cs && m.s < L - ce)) g.linerHoles.push(mapped.map((m) => m.p));
    }
  // lock tabs at the liner's end, through slots in the base
  const pc = parentConn(d, p.id);
  const base = pc ? d.panels[pc.a.panelId] : undefined;
  if (f.lock === 'tabs' && base && f.depth === null) {
    const Ll = L - cs - ce;
    const { w, at: where } = lockTabs(d, Ll, f.locks);
    const taper = 0.18 * w;
    for (const k of where) {
      const s0 = cs + k * Ll - w / 2, s1 = s0 + w;
      const o0 = rim + liner;
      g.adds.push({ panelId: p.id, poly: [at(s0, o0), at(s1, o0), at(s1 - taper, o0 + lockDepth), at(s0 + taper, o0 + lockDepth)] });
      g.scores.push({ panelId: p.id, a: at(s0, o0), b: at(s1, o0) });
      g.tabs.push({ x0: s0, x1: s1, depth: lockDepth });
      // slot: the tab's volume inside the base, projected, + c/2 all round; set back for a web
      const corners: P2[] = [];
      for (const s of [s0, s1])
        for (const qi of [t + liner, t + liner + t])
          for (const z of [t, 2 * t]) {
            const lp = { x: e.a.x + dir.x * s + inw.x * qi, y: e.a.y + dir.y * s + inw.y * qi };
            corners.push(toLocal(base.frame, toWorld(p.frame, lp.x, lp.y, z)));
          }
      let slot = offsetConvex(hull(corners), c / 2);
      const be = findEdge(base, pc!.a.edge);
      if (be) {
        const bi = segInward(be);
        const dist = Math.min(...slot.map((q) => (q.x - be.a.x) * bi.x + (q.y - be.a.y) * bi.y));
        const need = minWeb(d.material) - dist;
        if (need > 0) slot = slot.map((q) => ({ x: q.x + bi.x * need, y: q.y + bi.y * need }));
      }
      g.holes.push({ panelId: base.id, poly: slot });
    }
  }
  return g;
}

function hull(pts: P2[]): P2[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cr = (o: P2, a: P2, b: P2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo: P2[] = [], up: P2[] = [];
  for (const q of p) {
    while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 1e-12) lo.pop();
    lo.push(q);
  }
  for (const q of [...p].reverse()) {
    while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 1e-12) up.pop();
    up.push(q);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

/** Every fold-over's geometry in a design. */
export function allFoldOvers(d: Design): { panelId: string; f: FoldOver; g: FoldOverGeom }[] {
  const out: { panelId: string; f: FoldOver; g: FoldOverGeom }[] = [];
  for (const id of d.order) {
    const p = d.panels[id];
    for (const f of p?.foldOvers ?? []) {
      const g = foldOverGeom(d, p, f);
      if (g) out.push({ panelId: id, f, g });
    }
  }
  return out;
}
