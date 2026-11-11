// Placed and construction panels (milestone 28, PANELS_AND_DIVIDERS.md).
//
// A placed panel (`Panel.place`) sits on the floor or on a face of another
// panel (its host): flat on the face, or standing on a line drawn on it. It is
// a net of its own (never folded to or grown from its host) and follows its
// host: its frame is derived from the host's in `solve`, so when the host
// moves, turns or changes size, it goes with it. A standing panel's bottom
// edge is joined to the face like any edge on a face; a flat one is not
// joined to its host at all (a separate part in the cut plan).
//
// A construction panel (`Panel.construction` on the root of a net; grown
// panels inherit it) is a guide: drawn, drawn on and snapped to, but never cut,
// never joined, and left out of pieces, packing, export, seams, contacts,
// through-cuts and fold nets.
import type { Design, Frame, Panel, PanelPlace, V3 } from './types';
import { frameNormal, matDir, toLocal, toWorld } from './frame';
import { tOf } from './materials';
import { pieceRoot, placementPiece } from './keys';
import { v3add, v3clean, v3dot, v3mul, v3norm, v3sub } from '../geom/v3';

/** The floor as a host: local x along world X, y along world −Z (as floor panels), material up. */
export const FLOOR_FRAME: Frame = { o: [0, 0, 0], u: [1, 0, 0], v: [0, 0, -1], side: 1 };

/** A host's frame and thickness (the floor: no thickness). */
export function hostFrame(d: Design, host: string | null): { frame: Frame; t: number } | null {
  if (host === null) return { frame: FLOOR_FRAME, t: 0 };
  const h = d.panels[host];
  return h ? { frame: h.frame, t: tOf(d, host) } : null;
}

/** World direction out of a host's face (1: its material side, −1: its plane). */
export function faceOut(f: Frame, face: 1 | -1): V3 {
  return v3mul(matDir(f), face);
}

/** The frame a placed panel has on its host (null when the host is gone). */
export function placeFrame(d: Design, place: PanelPlace): Frame | null {
  const h = hostFrame(d, place.host);
  if (!h) return null;
  const H = h.frame;
  const face: 1 | -1 = place.host === null ? 1 : place.face;
  const a = (place.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const u = v3norm(v3add(v3mul(H.u, c), v3mul(H.v, s)));
  const o = toWorld(H, place.x, place.y, face === 1 ? h.t : 0);
  if (place.pose === 'flat') {
    const v = v3norm(v3add(v3mul(H.u, -s), v3mul(H.v, c)));
    return { o: v3clean(o), u: v3clean(u), v: v3clean(v), side: (face * H.side) as 1 | -1 };
  }
  // standing: up out of the face, along the drawn line; the material on `side` of it
  const v = faceOut(H, face);
  return { o: v3clean(o), u: v3clean(u), v: v3clean(v), side: place.side ?? 1 };
}

/** Is a panel placed (flat or standing) on this host (directly)? */
export const hostedOn = (d: Design, host: string): string[] => d.order.filter((id) => d.panels[id]?.place?.host === host);

/** Would placing `id` on `host` make a cycle (the host is placed on it, directly or further down)? */
export function placeCycle(d: Design, id: string, host: string | null): boolean {
  for (let h = host, i = 0; h !== null && i < 1000; i++) {
    if (h === id) return true;
    h = d.panels[h]?.place?.host ?? hostOfGrown(d, h);
  }
  return false;
}
/** The placed panel a grown panel ultimately rests on (through its parents), for the cycle test. */
function hostOfGrown(d: Design, id: string): string | null {
  const c = Object.values(d.connections).find((x) => x.grown && x.b.panelId === id);
  return c ? c.a.panelId : null;
}

/** The root of the net a panel belongs to (up through grown parents). */
export function netRoot(d: Design, id: string): string {
  let cur = id;
  for (let i = 0; i < 1000; i++) {
    const c = Object.values(d.connections).find((x) => x.grown && x.b.panelId === cur);
    if (!c || !d.panels[c.a.panelId]) return cur;
    cur = c.a.panelId;
  }
  return cur;
}

/** Every construction panel (roots marked, and everything grown from them). */
export function constructionSet(d: Design): Set<string> {
  const out = new Set<string>();
  if (!Object.values(d.panels).some((p) => p.construction)) return out;
  const children = new Map<string, string[]>();
  for (const c of Object.values(d.connections)) if (c.grown) children.set(c.a.panelId, [...(children.get(c.a.panelId) ?? []), c.b.panelId]);
  const stack = d.order.filter((id) => d.panels[id]?.construction);
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    stack.push(...(children.get(id) ?? []));
  }
  return out;
}

/** Is this panel a construction panel (its net's root is marked)? */
export function isConstruction(d: Design, id: string): boolean {
  return constructionSet(d).has(id);
}

/** A flat placed panel and its host: not joined, not reported as touching. */
export function flatOnHost(d: Design, a: string, b: string): boolean {
  const pa = d.panels[a], pb = d.panels[b];
  return (pa?.place?.pose === 'flat' && pa.place.host === b) || (pb?.place?.pose === 'flat' && pb.place.host === a);
}

/**
 * Drop a panel placed on a host that is going away onto the floor, keeping its
 * pose (flat stays flat, standing stays standing) and where it is seen from
 * above.
 */
export function dropToFloor(d: Design, p: Panel) {
  const pl = p.place;
  if (!pl) return;
  const f = p.frame;
  const fl = (w: V3) => toLocal(FLOOR_FRAME, [w[0], 0, w[2]]);
  // its direction along the floor: u, or v when u is nearly vertical
  const along = Math.hypot(f.u[0], f.u[2]) > 0.2 ? f.u : f.v;
  const rot = (Math.atan2(-along[2], along[0]) * 180) / Math.PI;
  if (pl.pose === 'flat') {
    // its centre stays where it is seen from above
    const c = fl(toWorld(f, p.w / 2, p.h / 2));
    const a = (rot * Math.PI) / 180;
    const ox = (p.w / 2) * Math.cos(a) - (p.h / 2) * Math.sin(a), oy = (p.w / 2) * Math.sin(a) + (p.h / 2) * Math.cos(a);
    p.place = { host: null, face: 1, x: c.x - ox, y: c.y - oy, rot, pose: 'flat' };
  } else {
    const o = fl(f.o);
    // keep which side of its line the material is on, seen from above
    const n = frameNormal(placeFrame(d, { host: null, face: 1, x: 0, y: 0, rot, pose: 'standing' })!);
    p.place = { host: null, face: 1, x: o.x, y: o.y, rot, pose: 'standing', side: v3dot(matDir(f), n) >= 0 ? 1 : -1 };
  }
}

/** A placed panel's position on its host from a frame (after its sketch moved its origin). */
export function placeFromFrame(d: Design, p: Panel, f: Frame) {
  const pl = p.place;
  if (!pl) return;
  const h = hostFrame(d, pl.host);
  if (!h) return;
  const l = toLocal(h.frame, f.o);
  pl.x = l.x;
  pl.y = l.y;
  void v3sub;
}

/**
 * Remove a panel from the design and everything that names it (BUGFIX_PLAN B22): panels placed on it
 * drop to the floor where they are, joints to it go, and so do its quantity and sheet placements.
 * Every path that removes a panel uses it (deleting, tray and wall-set reconciliation), so no
 * `place.host` is left naming a panel that is gone.
 */
export function removePanelRecord(d: Design, panelId: string) {
  for (const id of hostedOn(d, panelId)) {
    dropToFloor(d, d.panels[id]);
    for (const c of Object.values(d.connections)) if (!c.grown && ((c.a.panelId === id && c.b.panelId === panelId) || (c.b.panelId === id && c.a.panelId === panelId))) delete d.connections[c.id];
  }
  for (const c of Object.values(d.connections)) if (c.a.panelId === panelId || c.b.panelId === panelId) delete d.connections[c.id];
  delete d.panels[panelId];
  delete d.pieces[panelId];
  d.order = d.order.filter((id) => id !== panelId);
  for (const k of Object.keys(d.placements)) if (pieceRoot(placementPiece(k)) === panelId) delete d.placements[k];
}

/** Panels placed on a host that is not there (an older file): they drop to the floor where they are. */
export function dropOrphansToFloor(d: Design) {
  for (const id of d.order) {
    const p = d.panels[id];
    const h = p?.place?.host;
    if (h != null && !d.panels[h]) dropToFloor(d, p);
  }
}

