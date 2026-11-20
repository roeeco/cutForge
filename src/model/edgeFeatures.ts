// The edge-feature registry (milestone 111, DIELINE_DNA_PLAN.md D3a): what a
// board adds on one of its free edges, behind one interface. Two kinds today:
// fold-overs (milestone 61) and flaps (milestone 67, shaped in 112). Their
// output feeds `extrasByPanel` in one loop, in the same order as before:
// every fold-over (by `d.order`, then by array), then every flap.
import type { Design, Flap3d, FoldOver, P2, Panel } from './types';
import type { MsgKey } from '../i18n';
import { findEdge, segDir, segInward, segLength, type EdgeSeg } from './edges';
import { allFoldOvers } from './foldover';
import { memo } from './derived';

/** What one edge feature adds: on its own board, except holes, which may be in another (a fold-over's lock slots are in the base). */
export type EdgeFeatureOut = {
  adds: P2[][];
  scores: { a: P2; b: P2; toward?: 1 | -1 }[];
  holes: { panelId: string; poly: P2[] }[];
  linerHoles: P2[][];
  /** Parts that turn about a crease in 3D (shaped flaps, 112); empty for parts drawn flat or by their own renderer. */
  hinged: Flap3d[];
};

export type EdgeFeatureKindId = 'foldover' | 'flap';

export type EdgeFeatureKind = {
  id: EdgeFeatureKindId;
  /** The features of this kind a board carries: a key, the edge and the stored item. */
  on(p: Panel): { key: string; edge: string; item: unknown }[];
  geom(d: Design, p: Panel, item: unknown): EdgeFeatureOut | null;
  /** Why this kind cannot go on that edge now (112). */
  blocked?(d: Design, p: Panel, edge: string): MsgKey | null;
};

export type EdgeFeatureHit = { panelId: string; kind: EdgeFeatureKindId; key: string; edge: string; out: EdgeFeatureOut };

const empty = (): EdgeFeatureOut => ({ adds: [], scores: [], holes: [], linerHoles: [], hinged: [] });

/** Is this edge of the board joined to another board (a connection on it)? */
export function edgeJoined(d: Design, p: Panel, edge: string): boolean {
  const e = findEdge(p, edge);
  if (!e) return false;
  return Object.values(d.connections).some((c) => (c.a.panelId === p.id && findEdge(p, c.a.edge)?.key === e.key) || (c.b.panelId === p.id && c.b.edge !== 'face' && findEdge(p, c.b.edge)?.key === e.key));
}

/**
 * A plain flap on a free edge (milestone 67): a lip `len` mm out from the
 * edge, its ends tapered 30°, scored where it folds. None on an edge that is
 * gone or joined.
 */
export function edgeFlapGeom(d: Design, p: Panel, f: { edge: string; len: number }): { poly: P2[]; score: { a: P2; b: P2 } } | null {
  const e = findEdge(p, f.edge);
  if (!e) return null;
  if (edgeJoined(d, p, f.edge)) return null;
  return flapOn(e, f.len);
}

/** A flap `len` mm out from an edge, its ends tapered 30°, and its score line (milestone 67; a divider's end on a curved band, milestone 70). */
export function flapOn(e: EdgeSeg, len0: number, scoreIn = 0): { poly: P2[]; score: { a: P2; b: P2 } } {
  const L = segLength(e), dir = segDir(e), inw = segInward(e);
  const len = Math.max(2, len0);
  const taper = Math.min(len * Math.tan(Math.PI / 6), L / 3);
  const at = (s: number, o: number): P2 => ({ x: e.a.x + dir.x * s - inw.x * o, y: e.a.y + dir.y * s - inw.y * o });
  // `scoreIn`: a crease half a thickness inside the edge, where the flap folds against a board (milestone overhaul)
  return { poly: [at(0, -0.01), at(L, -0.01), at(L - taper, len), at(taper, len)], score: { a: at(0, -scoreIn), b: at(L, -scoreIn) } };
}

const foldOverKind: EdgeFeatureKind = {
  id: 'foldover',
  on: (p) => (p.foldOvers ?? []).map((f) => ({ key: f.id, edge: f.edge, item: f })),
  geom: () => null, // fold-over hits come from `allFoldOvers` (its memo), below
};

const flapKind: EdgeFeatureKind = {
  id: 'flap',
  on: (p) => (p.edgeFlaps ?? []).map((f) => ({ key: f.id, edge: f.edge, item: f })),
  geom: (d, p, item) => {
    const g = edgeFlapGeom(d, p, item as { edge: string; len: number });
    if (!g) return null;
    return { ...empty(), adds: [g.poly], scores: [g.score] };
  },
};

export const EDGE_FEATURES: EdgeFeatureKind[] = [foldOverKind, flapKind];
export const edgeFeatureKind = (id: EdgeFeatureKindId) => EDGE_FEATURES.find((k) => k.id === id)!;

function foldOverHit(panelId: string, f: FoldOver, g: ReturnType<typeof allFoldOvers>[number]['g']): EdgeFeatureHit {
  return {
    panelId,
    kind: 'foldover',
    key: f.id,
    edge: f.edge,
    out: { adds: g.adds.map((a) => a.poly), scores: g.scores, holes: g.holes, linerHoles: g.linerHoles, hinged: [] },
  };
}

function flapHits(d: Design, only?: string): EdgeFeatureHit[] {
  const out: EdgeFeatureHit[] = [];
  for (const id of d.order) {
    const p = d.panels[id];
    // a flap's output is all on its own board: skip the others before working out geometry
    if (!p?.edgeFlaps?.length || (only && id !== only)) continue;
    for (const it of flapKind.on(p)) {
      const g = flapKind.geom(d, p, it.item);
      if (g) out.push({ panelId: id, kind: 'flap', key: it.key, edge: it.edge, out: g });
    }
  }
  return out;
}

function computeEdgeFeatures(d: Design, only?: string): EdgeFeatureHit[] {
  return [...allFoldOvers(d).map((x) => foldOverHit(x.panelId, x.f, x.g)), ...flapHits(d, only)];
}

/** Every edge feature in a design, fold-overs first (milestone 111). `only`: flaps of that board only (fold-overs are all kept: their slots may be in it). */
export function edgeFeatures(d: Design, only?: string): EdgeFeatureHit[] {
  if (only === undefined && Object.isFrozen(d)) return memo(d, 'edgeFeatures', () => computeEdgeFeatures(d));
  return computeEdgeFeatures(d, only);
}

/** The edge features on one edge of a board. */
export function featuresOnEdge(d: Design, panelId: string, edge: string): EdgeFeatureHit[] {
  const p = d.panels[panelId];
  const key = p && findEdge(p, edge)?.key;
  if (!key) return [];
  return edgeFeatures(d, panelId).filter((h) => h.panelId === panelId && findEdge(p, h.edge)?.key === key);
}
