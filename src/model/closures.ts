// Closures (milestone 67, PACKAGING_PLAN.md §7). A lid folded off one wall of
// a tray, whose far edge reaches the opposite wall, seals the box's opening.
// While it does, a closure joint (`Connection.kind 'closure'`) is derived from
// the lid's settings (`Design.closures`): a tuck lip that slides inside the
// front wall, dust flaps on the side walls folded in under the lid, slit
// locks, a tongue through a slot, a thumb notch, or nothing (a lid that rests
// on the walls). It replaces the joints the editor would otherwise make
// between the lid and those walls. Pulled short, the lid stops sealing and
// the joint goes; its settings stay, and come back with it.
import type { Closure, ClosureStyle, ConnGeom, Connection, Design, MaterialKind, P2, Panel } from './types';
import { findEdge, segLength } from './edges';
import { matDir, toLocal, toWorld } from './frame';
import { matOf, tOf } from './materials';
import { v3cross, v3dot, v3sub, v3norm } from '../geom/v3';
import { autoFlap } from './seams';
import { bandOf } from './bands';
import { endGeom, reconcileEnds } from './cartons';

/** The closure joint of a lid. */
export const closureId = (lid: string) => `close:${lid}`;

/** Closure styles a material offers, its default first. */
export function closureStyles(kind: MaterialKind): ClosureStyle[] {
  if (kind === 'card') return ['tuck', 'tuckLock', 'tab', 'rest', 'glued'];
  if (kind === 'corrugated') return ['tab', 'tuck', 'rest', 'glued'];
  return ['rest'];
}

/**
 * Where a lid would seal its box: the wall opposite its hinge (`front`) and
 * how far along the lid that wall's faces are (`yIn` its inside face, `yOut`
 * its outside), and the walls under its sides (with the lid edge each one is
 * under). Null when it is not a lid folded off a tray wall's top over its box.
 */
export type Seal = { lid: string; hinge: string; wall: string; front: string; yIn: number; yOut: number; sides: { panelId: string; under: 'e1' | 'e3' }[] };

/** The lid a panel would be, folded off `parent`'s edge with `frame` and depth `h`: does it seal? (Also for a ghost not yet in the design.) */
export function sealFor(d: Design, L: Pick<Panel, 'id' | 'w' | 'h' | 'frame'>, parentId: string, hingeId: string): Seal | null {
  const r = reachFor(d, L, parentId, hingeId);
  // its far edge reaches the front wall: from a little short of its inside face to its outside face
  return r && L.h >= r.yIn - 3 && L.h <= r.yOut + 1 ? r : null;
}

/** The wall a lid folded off `parent` faces across the box, and the walls under its sides, whatever its depth (null when there is none). */
export function reachFor(d: Design, L: Pick<Panel, 'id' | 'w' | 'h' | 'frame'>, parentId: string, hingeId: string): Seal | null {
  const W = d.panels[parentId];
  if (!W) return null;
  const tray = Object.values(d.trays ?? {}).find((t) => Object.values(d.connections).some((c) => c.grown && c.trayId === t.id && c.b.panelId === parentId));
  if (!tray) return null;
  const walls = Object.values(d.connections).filter((c) => c.grown && c.trayId === tray.id && c.b.panelId !== parentId).map((c) => c.b.panelId);
  const u = L.frame.u, v = L.frame.v;
  let front: Seal['front'] | null = null, yIn = 0, yOut = 0;
  const sides: Seal['sides'] = [];
  for (const id of walls) {
    const X = d.panels[id];
    if (!X) continue;
    const n = v3norm(v3cross(X.frame.u, X.frame.v));
    const tX = tOf(d, id);
    const along = (dir: typeof u) => Math.abs(v3dot(n, dir));
    if (along(v) > 0.99) {
      // a wall facing the lid's depth: where its two faces cross the lid's middle line
      const ys = [0, tX].map((z) => {
        const p = toWorld(X.frame, 0, 0, z);
        return v3dot(v3sub(p, L.frame.o), n) / v3dot(v, n);
      });
      const lo = Math.min(...ys), hi = Math.max(...ys);
      if (lo > 1 && (!front || lo < yIn)) {
        front = id;
        yIn = lo;
        yOut = hi;
      }
    } else if (along(u) > 0.99) {
      // a wall facing the lid's width, at one of its sides
      const xs = [0, tX].map((z) => v3dot(v3sub(toWorld(X.frame, 0, 0, z), L.frame.o), n) / v3dot(u, n));
      const lo = Math.min(...xs), hi = Math.max(...xs), t = tOf(d, L.id in d.panels ? L.id : parentId);
      if (Math.abs(lo) < 2 * t + 1 || Math.abs(hi) < 2 * t + 1) sides.push({ panelId: id, under: 'e3' });
      else if (Math.abs(lo - L.w) < 2 * t + 1 || Math.abs(hi - L.w) < 2 * t + 1) sides.push({ panelId: id, under: 'e1' });
    }
  }
  if (!front) return null;
  return { lid: L.id, hinge: hingeId, wall: parentId, front, yIn, yOut, sides };
}

/** The seal of a lid in the design: a panel folded off a tray wall's top edge (null otherwise). */
export function sealOf(d: Design, lidId: string): Seal | null {
  const L = d.panels[lidId];
  const c = Object.values(d.connections).find((x) => x.grown && x.b.panelId === lidId);
  if (!L || !c || c.kind !== 'fold') return null;
  return sealFor(d, L, c.a.panelId, c.id);
}

/** A lid's closure settings: its own, else its material's default. */
export function closureOf(d: Design, lidId: string): Closure {
  return d.closures?.[lidId] ?? { style: closureStyles(matOf(d, lidId).kind)[0] };
}

/**
 * Keep a closure joint on every lid that seals its box (in `solve`, once
 * frames are placed), and none on a lid that does not. Its settings are kept
 * either way.
 */
export function reconcileClosures(d: Design) {
  reconcileEnds(d);
  // the settings of a lid that is gone go with it
  if (d.closures) for (const k of Object.keys(d.closures)) if (!d.panels[k]) delete d.closures[k];
  if (d.closures && !Object.keys(d.closures).length) delete d.closures;
  const want = new Map<string, Seal>();
  for (const id of d.order) {
    const s = sealOf(d, id);
    if (s) want.set(closureId(id), s);
  }
  for (const c of Object.values(d.connections)) if (c.kind === 'closure' && c.id.startsWith('close:') && !want.has(c.id)) delete d.connections[c.id];
  for (const [id, s] of want) {
    const ex = d.connections[id];
    if (ex) {
      ex.covers = [s.front, ...s.sides.map((x) => x.panelId)];
      continue;
    }
    d.connections[id] = { id, kind: 'closure', a: { panelId: s.lid, edge: 'e2' }, b: { panelId: s.front, edge: 'face' }, grown: false, angle: 90, dir: 'up', offset: 0, fingers: null, tabs: null, flap: null, foldDir: 'valley', auto: true, covers: [s.front, ...s.sides.map((x) => x.panelId)] };
  }
}

/** Pairs of panels a closure covers (its lid with each wall): the editor makes no other joint between them. */
export function closureCovers(d: Design): Set<string> {
  const out = new Set<string>();
  for (const c of Object.values(d.connections)) if (c.kind === 'closure') for (const w of c.covers ?? []) out.add(c.a.panelId < w ? `${c.a.panelId}|${w}` : `${w}|${c.a.panelId}`);
  return out;
}

/** A closure's lip length: its own, else 30% of the lid's depth, 12–22 mm. */
export const lipLength = (cl: Closure, lidDepth: number) => cl.lip ?? Math.min(22, Math.max(12, 0.3 * lidDepth));

const emptyGeom = (): ConnGeom => ({ edges: [], holes: [], adds: [], scores: [], flaps3d: [] });

/** A rectangle with its far corners rounded (radius r), from the line y = y0 out to y1, x from x0 to x1. */
function roundedTab(x0: number, x1: number, y0: number, y1: number, r: number): P2[] {
  const rr = Math.max(0, Math.min(r, (x1 - x0) / 2, Math.abs(y1 - y0)));
  const sg = Math.sign(y1 - y0) || 1;
  const arc = (cx: number, cy: number, a0: number, a1: number) => Array.from({ length: 6 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / 5;
    return { x: cx + rr * Math.cos(a), y: cy + sg * rr * Math.sin(a) };
  });
  return [{ x: x0, y: y0 }, { x: x1, y: y0 }, ...arc(x1 - rr, y1 - sg * rr, 0, Math.PI / 2), ...arc(x0 + rr, y1 - sg * rr, Math.PI / 2, Math.PI)];
}

/**
 * A closure's joint geometry, in its panels' own coordinates: the lip (and its
 * tongue, or slit locks) on the lid's far edge, folded down inside the front
 * wall; dust flaps on the side walls' top edges, folded in under the lid; a
 * slot for the tongue and a thumb notch in the front wall.
 */
export function closureGeom(d: Design, c: Connection): ConnGeom | null {
  // a tray's flapped end (milestone 68)
  if (c.id.startsWith('end:')) return endGeom(d, c);
  const s = sealOf(d, c.a.panelId);
  if (!s) return null;
  const L = d.panels[s.lid], F = d.panels[s.front];
  const g = emptyGeom();
  const cl = closureOf(d, s.lid);
  const mL = matOf(d, L.id), tL = mL.thickness, tF = tOf(d, F.id), clr = Math.max(mL.clearance, matOf(d, F.id).clearance);
  const style = closureStyles(mL.kind).includes(cl.style) ? cl.style : closureStyles(mL.kind)[0];
  const eF = findEdge(F, 'e2');
  // where the lid's far edge is over the front wall, in the front wall's coordinates
  const down = (x: number, q: number) => {
    // a point on the lid's far edge, then q down along the front wall's inside face
    const top = toWorld(L.frame, x, L.h, 0);
    const p = toLocal(F.frame, top);
    return { x: p.x, y: (eF ? eF.a.y : F.h) - q };
  };
  if (style === 'tuck' || style === 'tuckLock' || style === 'tab' || style === 'glued') {
    const len = style === 'glued' ? autoFlap(mL) : lipLength(cl, L.h);
    const s0 = tL + 0.5, s1 = L.w - tL - 0.5;
    if (s1 - s0 > 4) {
      const lip = roundedTab(s0, s1, L.h, L.h + len, style === 'glued' ? 1 : 4);
      g.adds.push({ panelId: L.id, poly: lip });
      g.scores.push({ panelId: L.id, a: { x: s0, y: L.h }, b: { x: s1, y: L.h } });
      // folded down inside the front wall
      g.flaps3d.push({ panelId: F.id, poly: lip.map((q) => down(q.x, q.y - L.h)), z0: tF, z1: tF + tL });
      if (style === 'tuckLock') {
        // slits at the ends of the lip's fold, into the lid: they catch the dust flaps' shoulders
        g.lines = [
          { panelId: L.id, a: { x: s0, y: L.h }, b: { x: s0, y: L.h - 4 } },
          { panelId: L.id, a: { x: s1, y: L.h }, b: { x: s1, y: L.h - 4 } },
        ];
      }
      if (style === 'tab') {
        // a tongue on the lip's end, through a slot in the front wall where the lip ends
        const tw = Math.min(25, 0.3 * (s1 - s0)), tl = tF + 4;
        const mid = (s0 + s1) / 2;
        g.adds.push({ panelId: L.id, poly: roundedTab(mid - tw / 2, mid + tw / 2, L.h + len - 0.01, L.h + len + tl, 2) });
        const at = down(mid, len);
        const sw = tw + clr, sh = tL + clr;
        g.holes.push({ panelId: F.id, poly: [{ x: at.x - sw / 2, y: at.y - sh / 2 }, { x: at.x + sw / 2, y: at.y - sh / 2 }, { x: at.x + sw / 2, y: at.y + sh / 2 }, { x: at.x - sw / 2, y: at.y + sh / 2 }] });
      }
    }
  }
  // dust flaps on the side walls (tuck, tab), folded in under the lid
  if ((style === 'tuck' || style === 'tuckLock' || style === 'tab') && cl.dust !== false) {
    const W = d.panels[s.wall];
    for (const side of s.sides) {
      const S = d.panels[side.panelId];
      const e = S && findEdge(S, 'e2');
      if (!S || !e) continue;
      const tS = tOf(d, S.id);
      const len = segLength(e);
      // which end of its top edge is at the hinge wall
      const nearW = (x: number) => Math.abs(v3dot(v3sub(toWorld(S.frame, x, S.h, 0), W.frame.o), v3norm(v3cross(W.frame.u, W.frame.v))));
      const hingeAtZero = nearW(0) < nearW(len);
      const depth = Math.min(L.w / 2 - tS - 1, Math.max(12, 0.45 * L.w));
      // clear of the hinge: of a band's curve when the lid's hinge has one (the side wall's corner is cut back for it)
      const hb = bandOf(d, d.connections[s.hinge]);
      const relief = hb ? hb.Ro + 1 : tL + 1, lipRelief = tL + clr + 1;
      const xh = hingeAtZero ? relief : len - relief, xf = hingeAtZero ? len - lipRelief : lipRelief;
      const dir = Math.sign(xf - xh);
      const taperH = depth * Math.tan((15 * Math.PI) / 180), taperF = depth * Math.tan((8 * Math.PI) / 180);
      const y0 = e.a.y;
      const poly: P2[] = [
        { x: xh, y: y0 },
        { x: xf, y: y0 },
        ...(style === 'tuckLock' ? [{ x: xf, y: y0 + 3 }, { x: xf - dir * 3, y: y0 + 3 }] : []),
        { x: xf - dir * taperF, y: y0 + depth },
        { x: xh + dir * taperH, y: y0 + depth },
      ];
      const ring = dir > 0 ? poly : [...poly].reverse();
      g.adds.push({ panelId: S.id, poly: ring });
      g.scores.push({ panelId: S.id, a: { x: Math.min(xh, xf), y: y0 }, b: { x: Math.max(xh, xf), y: y0 } });
      // in 3D: in under the lid, from the side wall's top edge towards the box's middle
      const mS = matDir(S.frame);
      const under = (q: P2) => {
        const w = toWorld(S.frame, q.x, y0, tS / 2);
        const p = [w[0] + mS[0] * (q.y - y0), w[1] + mS[1] * (q.y - y0), w[2] + mS[2] * (q.y - y0)] as typeof w;
        return toLocal(L.frame, p);
      };
      g.flaps3d.push({ panelId: L.id, poly: ring.map(under), z0: tL, z1: tL + tS });
    }
  }
  // a thumb notch in the front wall's top, at its middle
  if (cl.thumb && eF && (style === 'tuck' || style === 'tuckLock' || style === 'tab')) {
    const r = Math.min(9, F.h / 3, segLength(eF) / 4);
    const mid = (eF.a.x + eF.b.x) / 2, y = eF.a.y;
    const pts: P2[] = [];
    for (let i = 0; i <= 16; i++) {
      const a = Math.PI + (Math.PI * i) / 16;
      pts.push({ x: mid + r * Math.cos(a), y: y + r * Math.sin(a) });
    }
    g.cuts = [...(g.cuts ?? []), { panelId: F.id, poly: [{ x: mid - r - 0.01, y: y + 1 }, ...pts, { x: mid + r + 0.01, y: y + 1 }] }];
  }
  return g;
}
