// A strip's boards as their bands leave them (milestone 174, BOXES_PLYWOOD_PLAN.md E2). A fold with a radius keeps
// both boards' frames where a sharp fold puts them and cuts each back to the arc's tangent point (milestone 63): the
// material past that point is the band's, not the board's. For a box's own bands (a hinged lid, an arched lid) the
// boards' sharp corners were left in for the contacts and the closing seams, as they always were. A strip of boards on
// a path (a tambour door, the shell it runs on) runs between guides that hug its arcs, and its sharp corners would run
// into them: for a strip's boards, contacts and closing seams see each board cut back to its bands' tangent points.
import type { Connection, Design, Panel } from './types';
import { bandOf, hasBand } from './bands';
import { straightRing } from './edges';

/** Is a board a box's (a tray's base or wall, or a lid)? */
const boxBoard = (d: Design, id: string) => !!d.panels[id]?.lidOf || Object.values(d.connections).some((c) => !!c.trayId && (c.a.panelId === id || c.b.panelId === id)) || Object.values(d.trays ?? {}).some((t) => t.baseId === id);

/** A strip's band: a grown fold with a radius between two boards neither of which is a box's (milestone 174). */
export function isStripBand(d: Design, c: Connection): boolean {
  return c.grown && !c.trayId && !c.wing && hasBand(d, c) && !boxBoard(d, c.a.panelId) && !boxBoard(d, c.b.panelId);
}

/** How far each of a board's edges is cut back by its strip bands (edge key → mm). */
export function stripTrims(d: Design, panelId: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of Object.values(d.connections)) {
    if (c.a.panelId !== panelId && c.b.panelId !== panelId) continue;
    if (!c.grown || c.kind !== 'fold' || !isStripBand(d, c)) continue;
    const b = bandOf(d, c);
    if (!b || !b.fits) continue;
    if (c.a.panelId === panelId) out.set(c.a.edge, Math.max(out.get(c.a.edge) ?? 0, b.trimP));
    else out.set('e0', Math.max(out.get('e0') ?? 0, b.trimC));
  }
  return out;
}

/**
 * A board as its strip bands leave it: a copy whose outline stops at each band's tangent point, its edges keeping
 * their keys; the board itself when it has no strip band (or is not a plain four-sided board).
 */
export function stripTrimmed(d: Design, p: Panel): Panel {
  const trims = stripTrims(d, p.id);
  if (!trims.size) return p;
  const ring = straightRing(p);
  if (ring.length !== 4) return p;
  // each edge's line moved in by its trim, then the corners where the lines meet
  const lines = ring.map((e) => {
    const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y, L = Math.hypot(dx, dy) || 1;
    const n = { x: -dy / L, y: dx / L };
    const k = trims.get(e.key) ?? 0;
    return { a: { x: e.a.x + n.x * k, y: e.a.y + n.y * k }, d: { x: dx / L, y: dy / L }, key: e.key };
  });
  const meet = (l1: (typeof lines)[number], l2: (typeof lines)[number]) => {
    const den = l1.d.x * l2.d.y - l1.d.y * l2.d.x;
    if (Math.abs(den) < 1e-9) return null;
    const s = ((l2.a.x - l1.a.x) * l2.d.y - (l2.a.y - l1.a.y) * l2.d.x) / den;
    return { x: l1.a.x + l1.d.x * s, y: l1.a.y + l1.d.y * s };
  };
  const pts = lines.map((l, i) => meet(lines[(i + 3) % 4], l));
  if (pts.some((q) => !q)) return p;
  return { ...p, sketch: { kind: 'poly', pts: pts as { x: number; y: number }[], edgeIds: lines.map((l) => l.key) } };
}
