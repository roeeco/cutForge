// Trays (POLYGONS_AND_CUTS.md §6): a base extruded into a wall on every
// straight edge at one shared height. The tray is stored once
// (`Design.trays`); its walls are real panels that reconciliation in `solve`
// stands on every growable edge of the base (stable ids `<tray>/<edge>`),
// except edges in `openEdges` and edges shorter than 5 mm. Deleting a tray
// wall opens its edge; "Wall it" closes it again.
import type { ConnectionKind, Design, MaterialProfile, Panel, Tray } from './types';
import { isCurveKey, panelEdges, segDir, segLength, findEdge } from './edges';
import { matOf, minWeb, tOf } from './materials';

export const MIN_EDGE = 5;

/** Defaults by material: walls fold up from the base on card and corrugated (one net). */
export function trayKinds(m: MaterialProfile): { wallKind: ConnectionKind; cornerKind: ConnectionKind } {
  if (m.kind === 'plywood') return { wallKind: 'finger', cornerKind: 'finger' };
  return { wallKind: 'fold', cornerKind: m.kind === 'corrugated' ? 'tabslot' : 'glue' };
}

/** The tray a panel belongs to: as its base, or as one of its walls. */
export function trayOf(d: Design, panelId: string): Tray | undefined {
  const trays = Object.values(d.trays ?? {});
  const asBase = trays.find((t) => t.baseId === panelId);
  if (asBase) return asBase;
  const c = Object.values(d.connections).find((x) => x.grown && x.b.panelId === panelId && x.trayId);
  return c ? d.trays[c.trayId!] : undefined;
}

/** Tray walls (panel ids) of a tray, in the base's edge order. */
export function trayWalls(d: Design, trayId: string): string[] {
  return d.order.filter((id) => Object.values(d.connections).some((c) => c.grown && c.trayId === trayId && c.b.panelId === id));
}

/** Wall height for a tray of outer height H: walls standing on the base lose its thickness. */
export function wallHeight(d: Design, kind: ConnectionKind, H: number, baseId?: string): number {
  return kind === 'finger' ? H : H - (baseId ? tOf(d, baseId) : d.material.thickness);
}

/** Base edges too short for a wall (left open, and named on the tray card). */
export function shortEdges(d: Design, tray: Tray): string[] {
  const base = d.panels[tray.baseId];
  return base ? panelEdges(base).filter((e) => segLength(e) < MIN_EDGE && !isCurveKey(e.key)).map((e) => e.key) : [];
}

/** Is this base edge walled (by a tray wall, a wall set or any wall standing at the edge)? */
function walled(d: Design, base: Panel, key: string): boolean {
  return Object.values(d.connections).some((c) => c.grown && c.a.panelId === base.id && (c.a.edge === key || findEdge(base, c.a.edge)?.key === key) && !(c.offset > 0 && !c.trayId));
}

/**
 * Stand a wall on every growable edge of each tray's base that has none and
 * is not open; keep tray walls at the tray's height; remove tray walls whose
 * edge is gone (or flag them when they carry shapes). Called by `solve`
 * before frames are derived, with `make` creating a wall.
 */
export function reconcileTrays(d: Design, make: (d: Design, tray: Tray, edge: string) => void) {
  for (const tray of Object.values(d.trays ?? {})) {
    const base = d.panels[tray.baseId];
    if (!base) {
      delete d.trays[tray.id];
      continue;
    }
    const edges = panelEdges(base).filter((e) => segLength(e) >= MIN_EDGE && !isCurveKey(e.key));
    const keys = new Set(edges.map((e) => e.key));
    for (const e of edges) if (!tray.openEdges.includes(e.key) && !walled(d, base, e.key)) make(d, tray, e.key);
    // walls whose edge is gone
    for (const c of Object.values(d.connections)) {
      if (!c.grown || c.trayId !== tray.id || c.a.panelId !== base.id) continue;
      const w = d.panels[c.b.panelId];
      if (!w) continue;
      const e = findEdge(base, c.a.edge);
      if (e && keys.has(e.key)) {
        w.broken = false;
        if (!w.customHeight) w.h = Math.max(MIN_EDGE, wallHeight(d, c.kind, tray.height, base.id));
        continue;
      }
      if (!w.details.length && !Object.values(d.connections).some((x) => x.grown && x.a.panelId === w.id)) {
        for (const x of Object.values(d.connections)) if (x.a.panelId === w.id || x.b.panelId === w.id) delete d.connections[x.id];
        delete d.panels[w.id];
        delete d.pieces[w.id];
        d.order = d.order.filter((x) => x !== w.id);
      } else w.broken = true;
    }
  }
}

/**
 * Inside corners: where the base turns inward (a reflex vertex) and walls
 * stand on both edges, the wall on the outgoing edge reaches back past the
 * vertex to the other wall's inner face, closing the gap (by t / sin of the
 * turn; at a square inside corner, t). With a tab-and-slot joint there it
 * reaches a web further, so the slots are closed holes.
 */
export function insideCornerExtensions(d: Design, isWallOn: (baseId: string, key: string) => string | undefined, seamKind: (a: string, b: string) => ConnectionKind | undefined) {
  for (const id of d.order) {
    const p = d.panels[id];
    if (p && p.ext) delete p.ext;
  }
  for (const id of d.order) {
    const base = d.panels[id];
    if (!base) continue;
    const ring = panelEdges(base);
    const n = ring.length;
    if (n < 3) continue;
    for (let i = 0; i < n; i++) {
      const prev = ring[(i + n - 1) % n], cur = ring[i];
      if (Math.hypot(prev.b.x - cur.a.x, prev.b.y - cur.a.y) > 1e-6) continue;
      const a = segDir(prev), b = segDir(cur);
      const turn = a.x * b.y - a.y * b.x; // < 0: the outline turns right, an inside corner
      if (turn > -1e-6) continue;
      const wa = isWallOn(base.id, prev.key), wb = isWallOn(base.id, cur.key);
      if (!wa || !wb) continue;
      const W = d.panels[wb];
      if (!W) continue;
      const sin = Math.min(1, Math.abs(turn));
      // to the other wall's inner face: its thickness; a web past tab slots in it
      let ext = tOf(d, wa) / Math.max(sin, 0.2);
      if (seamKind(wa, wb) === 'tabslot') ext += Math.max(2, minWeb(matOf(d, wa))) + matOf(d, wa).clearance / 2;
      W.ext = { s: ext, e: W.ext?.e ?? 0 };
    }
  }
}
