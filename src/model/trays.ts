// Trays (POLYGONS_AND_CUTS.md §6): a base extruded into a wall on every
// straight edge at one shared height. The tray is stored once
// (`Design.trays`); its walls are real panels that reconciliation in `solve`
// stands on every growable edge of the base (stable ids `<tray>/<edge>`),
// except edges in `openEdges` and edges shorter than 5 mm. Deleting a tray
// wall opens its edge; "Wall it" closes it again.
import type { ConnectionKind, Design, MaterialProfile, Panel, Tray } from './types';
import { isCurveKey, panelEdges, segDir, segLength, findEdge } from './edges';
import { gluesByDefault, tOf } from './materials';
import { removePanelRecord } from './place';
import { KEEP_STRAIGHT } from '../geom/fillet';

/** The shortest straight edge a wall stands on (mm); rounding keeps it (`KEEP_STRAIGHT`). */
export const MIN_EDGE = KEEP_STRAIGHT;

/** Defaults by material: walls fold up from the base on card and corrugated (one net). */
export function trayKinds(m: MaterialProfile): { wallKind: ConnectionKind; cornerKind: ConnectionKind } {
  if (m.kind === 'plywood') return { wallKind: 'finger', cornerKind: 'finger' };
  // card and 1.6 mm board glue their corners with flaps (the owner, 26 November); 4 mm board takes tabs and slots
  return { wallKind: 'fold', cornerKind: gluesByDefault(m) ? 'glue' : 'tabslot' };
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
      if (!w.details.length && !Object.values(d.connections).some((x) => x.grown && x.a.panelId === w.id)) removePanelRecord(d, w.id);
      else w.broken = true;
    }
  }
}

/**
 * The boxes whose base has an outside corner rigid corners would change: walls on both its edges, at a corner angle
 * fingers are laid out for (30° to 150°) and not square. Lids of their own are left out (they follow their box).
 */
export function angledTrays(d: Design): string[] {
  const out: string[] = [];
  const walls = new Map<string, Set<string>>();
  for (const c of Object.values(d.connections)) if (c.grown && c.trayId) walls.set(c.a.panelId, (walls.get(c.a.panelId) ?? new Set()).add(c.a.edge));
  for (const [id, t] of Object.entries(d.trays ?? {})) {
    const base = d.panels[t.baseId];
    if (!base || t.lidOf) continue;
    const ring = panelEdges(base), on = walls.get(base.id) ?? new Set();
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const prev = ring[(i + n - 1) % n], cur = ring[i];
      if (!on.has(prev.key) || !on.has(cur.key)) continue;
      const a = segDir(prev), b = segDir(cur);
      const turn = a.x * b.y - a.y * b.x;
      if (turn <= 1e-6) continue;
      const alpha = 180 - (Math.atan2(turn, a.x * b.x + a.y * b.y) * 180) / Math.PI;
      if (Math.abs(alpha - 90) >= 0.5 && alpha >= 30 - 1e-6 && alpha <= 150 + 1e-6) {
        out.push(id);
        break;
      }
    }
  }
  return out;
}

/**
 * A rigid outside corner (`Tray.outsideCorners`): the wall ending there (A) and the one starting there (B). Its walls'
 * corner angle α is 180° less the outline's turn (cos θ = `dot`, sin θ = `turn`). Obtuse: each reaches on past the
 * corner by its thickness · |cot α|, so its square end meets the far side of where the two boards cross; acute: no
 * reach, the end only left whole (seams.ts). Square, or outside the angles fingers are laid out for: as before.
 */
function reachPast(d: Design, A: Panel, B: Panel, dot: number, turn: number) {
  const alpha = 180 - (Math.atan2(turn, dot) * 180) / Math.PI;
  // (seams.ts's MIN_CORNER and MAX_CORNER: the angles fingers are laid out for)
  if (Math.abs(alpha - 90) < 0.5 || alpha < 30 - 1e-6 || alpha > 150 + 1e-6) return;
  // |cot α| = cot θ for an obtuse α (θ the turn, under 90°)
  const k = alpha > 90 ? dot / turn : 0;
  const eA = tOf(d, A.id) * k, eB = tOf(d, B.id) * k;
  A.ext = { s: A.ext?.s ?? 0, e: (A.ext?.e ?? 0) + eA };
  A.reach = { ...(A.reach ?? {}), e: eA };
  B.ext = { s: (B.ext?.s ?? 0) + eB, e: B.ext?.e ?? 0 };
  B.reach = { ...(B.reach ?? {}), s: eB };
}

/**
 * Inside corners: where the base turns inward (a reflex vertex) and walls
 * stand on both edges, the wall on the outgoing edge reaches back past the
 * vertex to the other wall's inner face, closing the gap (by t / sin of the
 * turn; at a square inside corner, t). Tab slots there are open notches at
 * its end (the overhaul of 19 November), so it reaches no further.
 */
export function insideCornerExtensions(d: Design, isWallOn: (baseId: string, key: string) => string | undefined, _seamKind?: (a: string, b: string) => ConnectionKind | undefined) {
  for (const id of d.order) {
    const p = d.panels[id];
    if (p && p.ext) delete p.ext;
    if (p && p.reach) delete p.reach;
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
      const tray = Object.values(d.trays ?? {}).find((t) => t.baseId === base.id);
      if (turn > 1e-6) {
        // an outside corner: rigid corners reach past it (`Tray.outsideCorners`)
        if (tray?.outsideCorners === 'reach') {
          const wa = isWallOn(base.id, prev.key), wb = isWallOn(base.id, cur.key);
          if (wa && wb && d.panels[wa] && d.panels[wb]) reachPast(d, d.panels[wa], d.panels[wb], a.x * b.x + a.y * b.y, turn);
        }
        continue;
      }
      if (turn > -1e-6) continue;
      const wa = isWallOn(base.id, prev.key), wb = isWallOn(base.id, cur.key);
      if (!wa || !wb) continue;
      // the wall that closes the corner: the outgoing one, or the incoming one where it gives way so the net lies flat (milestone 35)
      if (tray?.insideCorners === 'finger' && d.panels[wa] && d.panels[wb]) {
        // milestone 180: both walls reach on to where their inner faces meet (P), and are fingered there as a corner
        // seen from inside. Each inner face is its edge moved in (to the left of the CCW outline) by its wall's thickness.
        const tA = tOf(d, wa), tB = tOf(d, wb);
        const na = { x: -a.y, y: a.x }, nb = { x: -b.y, y: b.x };
        // V + na·tA + s·a = V + nb·tB + u·b: A reaches s past the corner, B starts −u before it
        const rx = nb.x * tB - na.x * tA, ry = nb.y * tB - na.y * tA;
        const det = a.x * -b.y - a.y * -b.x;
        if (Math.abs(det) < 1e-9) continue;
        const s = (rx * -b.y - ry * -b.x) / det, u = (a.x * ry - a.y * rx) / det;
        const A = d.panels[wa], B = d.panels[wb];
        A.ext = { s: A.ext?.s ?? 0, e: Math.max(0, s) };
        B.ext = { s: Math.max(0, -u), e: B.ext?.e ?? 0 };
        continue;
      }
      const flip = tray?.fixPlan?.extOn?.[cur.key] === 'prev';
      const [closer, other] = flip ? [wa, wb] : [wb, wa];
      const W = d.panels[closer];
      if (!W) continue;
      const sin = Math.min(1, Math.abs(turn));
      // to the other wall's inner face: its thickness (tab slots at the corner are open notches, milestone overhaul: no web)
      const ext = tOf(d, other) / Math.max(sin, 0.2);
      W.ext = flip ? { s: W.ext?.s ?? 0, e: ext } : { s: ext, e: W.ext?.e ?? 0 };
    }
  }
}
