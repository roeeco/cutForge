// Arched lids (milestone 48, CURVED_WALLS.md §7.3). A box's two end walls
// (the walls across its short side, parallel and facing) get the same arch on
// top: the leader's top edge is a circular arch of the tray's `arch.rise`
// (`WallSketch.arch`), and the other end wall follows
// it as a matched wall (milestone 46). The lid is a bent panel grown along the
// leader's arched top: it lies over the arch, from the leader's inner face to
// the follower's, held to both by glue teeth folded down inside them (card,
// corrugated) or glued edge on (plywood). The rise is clamped so the arch is
// never tighter than the lid's material bends with its pattern.
import type { ConnGeom, Connection, Design, P2, Panel, Tray } from './types';
import { canMatch } from './match';
import { styleReach } from './bendPattern';
import { matOf, tOf } from './materials';
import { frameNormal, matDir, toLocal, toWorld } from './frame';
import { panelToWorld, radiusAt } from './bent';
import { autoFlap } from './seams';
import { v3add, v3dot, v3mul, v3sub } from '../geom/v3';


/** The id of an arched lid's far joint (the lid on the follower). */
export const archSeamId = (trayId: string) => `${trayId}|arch`;
/** Is this an arched lid's far joint? */
export const isArchSeam = (c: Pick<Connection, 'id'>) => c.id.endsWith('|arch');

/** The tray's straight walls (standing on its base, in creation order). */
function trayWalls(d: Design, t: Tray): Panel[] {
  return Object.values(d.connections)
    .filter((c) => c.grown && c.trayId === t.id && c.a.panelId === t.baseId)
    .map((c) => d.panels[c.b.panelId])
    .filter((p): p is Panel => !!p && !p.bent && p.sketch.kind === 'wall')
    .sort((a, b) => d.order.indexOf(a.id) - d.order.indexOf(b.id));
}

/** The two end walls an arched lid spans: the shortest pair of parallel walls facing each other. */
export function archWalls(d: Design, trayId: string): { lead: string; follow: string } | null {
  const t = d.trays?.[trayId];
  if (!t) return null;
  const ws = trayWalls(d, t);
  let best: { lead: string; follow: string; w: number } | null = null;
  for (let i = 0; i < ws.length; i++)
    for (let j = i + 1; j < ws.length; j++) {
      const a = ws[i], b = ws[j];
      if (!canMatch(d, b.id, a.id) && !(b.sketch.kind === 'wall' && b.sketch.match === a.id)) continue;
      const w = Math.max(a.w, b.w);
      if (!best || w < best.w - 1e-6) best = { lead: a.id, follow: b.id, w };
    }
  return best ? { lead: best.lead, follow: best.follow } : null;
}

/** The tightest radius the lid's material bends to with its pattern. */
const reachOf = (d: Design, lidOrLead: string) => {
  const m = matOf(d, lidOrLead);
  return styleReach(m, m.kind === 'card' ? 'score' : m.kind === 'corrugated' ? 'kiss' : 'lattice');
};

/** The highest arch over a chord c that is no tighter than radius R (and at most a half circle). */
export function archMaxRise(c: number, R: number): number {
  if (c / 2 >= R) return c / 2;
  return R - Math.sqrt(R * R - (c * c) / 4);
}

/** Give the leader its arch (its top corners square; the arch replaces its top's own points while it is set). */
function shapeLeader(L: Panel, rise: number) {
  if (L.sketch.kind !== 'wall') return;
  const s = L.sketch;
  if (s.corners) {
    for (const k of ['tl', 'tr'] as const) delete s.corners[k];
    if (!Object.keys(s.corners).length) delete s.corners;
  }
  if (rise > 1e-6) s.arch = rise;
  else delete s.arch;
}

/** The arch's rise clamped to what the lid can bend over (and a half circle). */
export function clampRise(d: Design, t: Tray, rise: number): number {
  const a = t.arch;
  const L = a && d.panels[a.lead];
  if (!L) return rise;
  return Math.max(0, Math.min(rise, archMaxRise(L.w, reachOf(d, a.lid in d.panels ? a.lid : a.lead))));
}

/**
 * Keep every arched lid (`solve`, before frames are placed): its leader's
 * arch from the rise (clamped), the follower linked to it. A lid whose walls
 * or lid went is dropped (the lid itself stays as a board).
 */
export function reconcileArches(d: Design) {
  for (const t of Object.values(d.trays ?? {})) {
    const a = t.arch;
    if (!a) continue;
    const L = d.panels[a.lead], F = d.panels[a.follow], lid = d.panels[a.lid];
    if (!L || !F || !lid || L.sketch.kind !== 'wall' || F.sketch.kind !== 'wall') {
      delete t.arch;
      if (L?.sketch.kind === 'wall') delete L.sketch.arch;
      delete d.connections[archSeamId(t.id)];
      continue;
    }
    a.rise = clampRise(d, t, a.rise);
    shapeLeader(L, a.rise);
    F.sketch.match = L.id;
    // the far joint: the lid's far edge on the follower
    const id = archSeamId(t.id);
    const kind = matOf(d, lid.id).kind === 'plywood' ? 'butt' : 'teeth';
    const ex = d.connections[id];
    if (!ex || ex.a.panelId !== lid.id || ex.b.panelId !== F.id) d.connections[id] = { id, kind, pref: kind, a: { panelId: lid.id, edge: 'e2' }, b: { panelId: F.id, edge: 'face' }, grown: false, angle: 90, dir: 'up', offset: 0, fingers: null, tabs: null, flap: null, foldDir: 'valley', auto: true };
    else ex.kind = ex.pref = kind;
  }
}

/** The tray whose arched lid this panel is. */
export const archOfLid = (d: Design, id: string): Tray | undefined => Object.values(d.trays ?? {}).find((t) => t.arch?.lid === id);

/**
 * Where an arched lid lies (`solve`, as it is bent along its leader's arch):
 * over the arch (its underside on it), from the leader's inner face across to
 * the follower's. Returns the offset from the arch, the lift from the
 * leader's plane and the lid's width across.
 */
export function lidPlace(d: Design, lid: Panel, lead: Panel, t: Tray): { off: number; lift: number; h: number } {
  const tl = tOf(d, lid.id), tL = tOf(d, lead.id);
  const F = t.arch ? d.panels[t.arch.follow] : undefined;
  const up = matDir(lead.frame);
  // the leader's inner face: its plane, or its plane plus its thickness, whichever faces the follower
  const toF = F ? v3dot(up, v3sub(F.frame.o, lead.frame.o)) : 1;
  const lift = toF >= 0 ? tL : 0;
  let h = lid.h;
  if (F) {
    const n = frameNormal(F.frame);
    // the follower's slab along the leader's direction: its near face
    const z0 = v3dot(up, v3sub(F.frame.o, lead.frame.o)), z1 = z0 + v3dot(up, v3mul(matDir(F.frame), tOf(d, F.id)));
    void n;
    h = Math.max(5, Math.min(Math.abs(z0), Math.abs(z1)) - lift);
  }
  return { off: -tl, lift, h };
}

/** The far joint's geometry: teeth on the lid's far edge folded down inside the follower (card, corrugated); nothing for a glued plywood edge. */
export function archFarGeom(d: Design, c: Connection): ConnGeom | null {
  const lid = d.panels[c.a.panelId], F = d.panels[c.b.panelId];
  if (!lid?.bent || !F) return null;
  const g: ConnGeom = { edges: [], holes: [], adds: [], scores: [], flaps3d: [] };
  if (c.kind !== 'teeth') return g;
  const m = matOf(d, lid.id), tl = m.thickness, tF = tOf(d, F.id);
  const fh = c.flap ?? autoFlap(m);
  const L = lid.w, H = lid.h;
  const n = Math.max(1, Math.round(L / Math.max(2 * fh, 8)));
  const step = L / n, gap = Math.min(step / 4, Math.max(1, 2 * tl));
  // which of the follower's faces is inside (towards the lid)
  const mid = panelToWorld(lid, L / 2, H / 2, tl);
  const inside = v3dot(matDir(F.frame), v3sub(mid, F.frame.o)) > 0;
  const [z0, z1] = inside ? [tF, tF + tl] : [-tl, 0];
  for (let i = 0; i < n; i++) {
    const s0 = i * step + gap / 2, s1 = (i + 1) * step - gap / 2, w = s1 - s0;
    const R = Math.max(1, radiusAt(lid.bent, (s0 + s1) / 2));
    const inset = Math.min(w / 2 - 0.5, Math.max(fh * 0.25, (w * fh) / (2 * R) + 0.5));
    g.adds.push({ panelId: lid.id, poly: [{ x: s1, y: H }, { x: s0, y: H }, { x: s0 + inset, y: H + fh }, { x: s1 - inset, y: H + fh }] });
    g.scores.push({ panelId: lid.id, a: { x: s0, y: H }, b: { x: s1, y: H } });
    // folded down along the follower's inner face, from under the lid's far edge
    const down = v3mul(F.frame.v, -1);
    const at = (s: number, u: number): P2 => toLocal(F.frame, v3add(panelToWorld(lid, s, H, tl), v3mul(down, u)));
    g.flaps3d.push({ panelId: F.id, poly: [at(s0, 0), at(s1, 0), at(s1 - inset, fh), at(s0 + inset, fh)], z0, z1 });
  }
  return g;
}

/** Make an arched lid on a tray: its end walls arched (the follower matched), the lid grown along the arch. */
export function planArch(d: Design, trayId: string, rise: number): { lead: string; follow: string } | null {
  const t = d.trays?.[trayId];
  if (!t || t.arch || t.lidOf) return null;
  const w = archWalls(d, trayId);
  if (!w) return null;
  const L = d.panels[w.lead];
  shapeLeader(L, Math.max(0, Math.min(rise, archMaxRise(L.w, reachOf(d, w.lead)))));
  return w;
}

/** World point helper for tests: a wall's top at x (its outline's top above x). */
export const wallTopAt = (p: Panel, x: number, y: number) => toWorld(p.frame, x, y, 0);
