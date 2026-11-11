// Trays (POLYGONS_AND_CUTS.md §6): a base extruded into a wall on every
// straight edge at one shared height. The tray is stored once
// (`Design.trays`); its walls are real panels that reconciliation in `solve`
// stands on every growable edge of the base (stable ids `<tray>/<edge>`),
// except edges in `openEdges` and edges shorter than 5 mm. Deleting a tray
// wall opens its edge; "Wall it" closes it again.
import type { ConnectionKind, Design, MaterialProfile, Panel, Tray } from './types';
import { curveRuns, isCurveKey, isRunKey, panelEdges, segDir, segLength, findEdge } from './edges';
import { curvedFor, curvedKinds, matOf, minWeb, tOf } from './materials';
import { removePanelRecord } from './place';

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
  return kind === 'finger' || kind === 'wrap' ? H : H - (baseId ? tOf(d, baseId) : d.material.thickness);
}

/**
 * The joint a tray's bent walls (on curve runs) have with its base (milestone
 * 46): the tray's own choice, else the one that stands them in line with its
 * straight walls, else (a round base) the material's default.
 */
export function trayCurveKind(d: Design, tray: Tray): ConnectionKind {
  const m = matOf(d, tray.baseId);
  const ok = curvedKinds(m);
  if (tray.curveKind && ok.includes(tray.curveKind)) return tray.curveKind;
  const base = d.panels[tray.baseId];
  const straight = !!base && panelEdges(base).some((e) => segLength(e) >= MIN_EDGE && !isCurveKey(e.key) && !tray.openEdges.includes(e.key));
  return straight ? curvedFor(tray.wallKind, m) : ok[0];
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
    // curve runs get one bent wall each (milestone 46)
    const runs = curveRuns(base).filter((r) => r.length >= MIN_EDGE);
    const keys = new Set([...edges.map((e) => e.key), ...runs.map((r) => r.key)]);
    for (const e of edges) if (!tray.openEdges.includes(e.key) && !walled(d, base, e.key)) make(d, tray, e.key);
    for (const r of runs) if (!tray.openEdges.includes(r.key) && !walled(d, base, r.key)) make(d, tray, r.key);
    // walls whose edge is gone
    for (const c of Object.values(d.connections)) {
      if (!c.grown || c.trayId !== tray.id || c.a.panelId !== base.id) continue;
      const w = d.panels[c.b.panelId];
      if (!w) continue;
      const e = isRunKey(c.a.edge) ? { key: c.a.edge } : findEdge(base, c.a.edge);
      if (e && keys.has(e.key)) {
        w.broken = false;
        if (!w.customHeight) w.h = Math.max(MIN_EDGE, wallHeight(d, c.kind, tray.height, base.id));
        continue;
      }
      if (!w.details.length && !Object.values(d.connections).some((x) => x.grown && x.a.panelId === w.id)) removePanelRecord(d, w.id);
      else w.broken = true;
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
      // the wall that closes the corner: the outgoing one, or the incoming one where it gives way so the net lies flat (milestone 35)
      const tray = Object.values(d.trays ?? {}).find((t) => t.baseId === base.id);
      const flip = tray?.fixPlan?.extOn?.[cur.key] === 'prev';
      const [closer, other] = flip ? [wa, wb] : [wb, wa];
      const W = d.panels[closer];
      if (!W) continue;
      const sin = Math.min(1, Math.abs(turn));
      // to the other wall's inner face: its thickness; a web past tab slots in it
      let ext = tOf(d, other) / Math.max(sin, 0.2);
      if (seamKind(wa, wb) === 'tabslot') ext += Math.max(2, minWeb(matOf(d, other))) + matOf(d, other).clearance / 2;
      W.ext = flip ? { s: W.ext?.s ?? 0, e: ext } : { s: ext, e: W.ext?.e ?? 0 };
    }
  }
}
