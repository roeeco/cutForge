// Matched walls (milestone 46, CURVED_WALLS.md §7.2). A wall's top outline can
// follow another wall's: `WallSketch.match` names the leader, and the follower
// stores no top of its own. On every solve its top corners' heights (and any
// sideways offset the leader's corners have) and the points inserted on its
// top edge are the leader's, projected through 3D onto it, which handles
// facing walls whose x runs the other way (an off-centre arch stays where it
// is, not mirrored) and walls at other heights. Its side edges keep their own
// points. Editing either wall's top edits the shared profile: an edit on the
// follower is written back to the leader. *Own outline* drops the link and
// keeps the shape. Only parallel walls facing each other (within 1°, side by
// side across) can be matched; others get a one-time *Copy outline from…*.
import type { Design, P2, Panel, WallInsert, WallSketch } from './types';
import { frameNormal, toLocal, toWorld } from './frame';
import { wallCorners } from './edges';
import { v3dot } from '../geom/v3';

const COS_1 = Math.cos((1 * Math.PI) / 180);

const wallOf = (p: Panel | undefined): (Panel & { sketch: WallSketch }) | null => (p && p.sketch.kind === 'wall' && !p.bent ? (p as Panel & { sketch: WallSketch }) : null);

/** A follower's leader (when the link still stands). */
export function leaderOf(d: Design, id: string): string | null {
  const p = wallOf(d.panels[id]);
  const m = p?.sketch.match;
  return m && wallOf(d.panels[m]) ? m : null;
}

/** The walls following this one. */
export const followersOf = (d: Design, id: string): string[] => d.order.filter((x) => leaderOf(d, x) === id);

/** Map from one wall's flat coordinates to another's, through 3D; `mirror` when their x runs opposite ways. */
function mapping(from: Panel, to: Panel): { map: (q: P2) => P2; mirror: boolean } {
  return { map: (q) => toLocal(to.frame, toWorld(from.frame, q.x, q.y, 0)), mirror: v3dot(from.frame.u, to.frame.u) < 0 };
}

/** Can wall `a` follow wall `b`: both straight walls with wall outlines, parallel within 1°, side by side across (their spans overlap)? */
export function canMatch(d: Design, a: string, b: string): boolean {
  const A = wallOf(d.panels[a]), B = wallOf(d.panels[b]);
  if (!A || !B || a === b || leaderOf(d, b) || followersOf(d, a).length) return false;
  if (Math.abs(v3dot(frameNormal(A.frame), frameNormal(B.frame))) < COS_1) return false;
  // facing: apart across their planes, with their spans overlapping along them
  const n = frameNormal(A.frame);
  const gap = Math.abs(v3dot(n, toWorld(B.frame, 0, 0, 0)) - v3dot(n, A.frame.o));
  if (gap < 1e-3) return false;
  const { map } = mapping(B, A);
  const xs = [map({ x: 0, y: 0 }).x, map({ x: B.w, y: 0 }).x];
  return Math.min(...xs) < A.w - 1e-6 && Math.max(...xs) > 1e-6;
}

/** Walls this wall could follow. */
export const matchCandidates = (d: Design, id: string): string[] => d.order.filter((x) => canMatch(d, id, x));

/** The base edge (a → b, CCW) a wall insert sits on, from a wall's corners. */
function insertBase(c: P2[], edge: WallInsert['edge']): [P2, P2] {
  return edge === 'e1' ? [c[1], c[2]] : edge === 'e2' ? [c[2], c[3]] : [c[3], c[0]];
}
function insertPoint(c: P2[], ins: WallInsert): P2 {
  const [a, b] = insertBase(c, ins.edge);
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1, dx = (b.x - a.x) / L, dy = (b.y - a.y) / L;
  // pushed outward: against the inward (left) normal
  return { x: a.x + dx * ins.t * L + dy * ins.off, y: a.y + dy * ins.t * L - dx * ins.off };
}
function insertAt(c: P2[], edge: WallInsert['edge'], P: P2): { t: number; off: number } {
  const [a, b] = insertBase(c, edge);
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1, dx = (b.x - a.x) / L, dy = (b.y - a.y) / L;
  const wx = P.x - a.x, wy = P.y - a.y;
  return { t: Math.max(0.01, Math.min(0.99, (wx * dx + wy * dy) / L)), off: Math.round((wx * dy - wy * dx) * 1e6) / 1e6 };
}

/**
 * Give wall `to` the top profile of wall `from` (projected through 3D, or for
 * walls that are not parallel, in their own coordinates scaled to its width): its
 * top corners' heights (and sideways offsets where `from` has them), their
 * curve flags, and the points on its top edge (same ids). Its own bottom
 * corners and side points stay.
 */
export function copyProfile(d: Design, fromId: string, toId: string) {
  const F = wallOf(d.panels[fromId]), T = wallOf(d.panels[toId]);
  if (!F || !T) return;
  // walls that are not parallel (a one-time copy): in their own coordinates, x scaled to the width
  const parallel = Math.abs(v3dot(frameNormal(F.frame), frameNormal(T.frame))) >= COS_1;
  const { map, mirror } = parallel ? mapping(F, T) : { map: (q: P2) => ({ x: (q.x * T.w) / (F.w || 1), y: q.y }), mirror: false };
  const fc = wallCorners(F.w, F.h, F.sketch);
  const fs = F.sketch, ts = T.sketch;
  const corners = { ...(ts.corners ?? {}) };
  for (const [fk, tk] of [['tl', mirror ? 'tr' : 'tl'], ['tr', mirror ? 'tl' : 'tr']] as const) {
    const src = fs.corners?.[fk];
    const P = map(fk === 'tl' ? fc[3] : fc[2]);
    const baseX = tk === 'tl' ? 0 : T.w;
    const own = ts.corners?.[tk];
    const dx = src?.dx ? Math.round((P.x - baseX) * 1e6) / 1e6 : (own?.dx ?? 0);
    const dy = Math.round((P.y - T.h) * 1e6) / 1e6;
    const v = { dx, dy, ...(src?.curve ? { curve: src.curve } : {}) };
    if (!v.dx && !v.dy && !v.curve) delete corners[tk];
    else corners[tk] = v;
  }
  if (Object.keys(corners).length) ts.corners = corners;
  else delete ts.corners;
  const tc = wallCorners(T.w, T.h, ts);
  const top = (fs.inserts ?? []).filter((x) => x.edge === 'e2').map((x) => {
    const at = insertAt(tc, 'e2', map(insertPoint(fc, x)));
    return { id: x.id, edge: 'e2' as const, ...at, ...(x.curve ? { curve: x.curve } : {}) };
  });
  const sides = (ts.inserts ?? []).filter((x) => x.edge !== 'e2');
  const inserts = [...sides, ...top];
  if (inserts.length) ts.inserts = inserts;
  else delete ts.inserts;
}

/** Every follower's top from its leader (`solve`, once frames are placed); a link to a wall that is gone or no longer facing is dropped, keeping the shape. */
export function reconcileMatches(d: Design) {
  for (const id of d.order) {
    const p = wallOf(d.panels[id]);
    const m = p?.sketch.match;
    if (!p || !m) continue;
    const L = wallOf(d.panels[m]);
    if (!L || L.sketch.match || Math.abs(v3dot(frameNormal(p.frame), frameNormal(L.frame))) < COS_1) {
      delete p.sketch.match;
      continue;
    }
    copyProfile(d, m, id);
  }
}

/** Link wall `id` to follow `leader` (its top becomes the leader's). */
export function linkMatch(d: Design, id: string, leader: string): boolean {
  if (!canMatch(d, id, leader)) return false;
  wallOf(d.panels[id])!.sketch.match = leader;
  return true;
}

/** *Own outline*: keep the follower's shape as its own points, without the link. */
export function unlinkMatch(d: Design, id: string): boolean {
  const p = wallOf(d.panels[id]);
  if (!p?.sketch.match) return false;
  delete p.sketch.match;
  return true;
}

/** After an edit of a follower's top: write it back to its leader, which the follower then follows again. */
export function pushToLeader(d: Design, id: string) {
  const l = leaderOf(d, id);
  if (l) copyProfile(d, id, l);
}

/** Outline snap targets from parallel facing walls (their top outline's points, projected onto this wall). */
export function facingTargets(d: Design, id: string): P2[] {
  const S = wallOf(d.panels[id]);
  if (!S) return [];
  const out: P2[] = [];
  for (const o of d.order) {
    const P = wallOf(d.panels[o]);
    if (!P || o === id || Math.abs(v3dot(frameNormal(P.frame), frameNormal(S.frame))) < COS_1) continue;
    const { map } = mapping(P, S);
    const c = wallCorners(P.w, P.h, P.sketch);
    for (const q of [c[2], c[3], ...(P.sketch.inserts ?? []).map((x) => insertPoint(c, x))]) out.push(map(q));
  }
  return out;
}
