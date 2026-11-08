// Pure model operations. Each takes a Design (an immer draft when called
// from the store) and mutates it. `solve` re-derives everything that is
// owned by connections, so every operation ends with a consistent design.
import type { Connection, ConnectionKind, Design, Detail, DetailShape, DetailOp, MaterialProfile, P2, Panel } from './types';
import { polygonArea } from '../geom/vec';
import { SCHEMA_VERSION } from './types';
import { DEFAULT_MATERIAL, connectionsFor, minWeb } from './materials';
import { edgeLength, growFrame, GROUND_FRAME, type GrowDir, type Seating } from './frame';
import { connectionGeom, findOpenSeams, seamKinds, seamStillFits, seamTypeOf, type OpenSeam } from './seams';
import { edgeNeighbours, ek, findEdge, isRectSketch, rectEdgeIndex, rectSketch, segDir, sketchOf, type EdgeArg } from './edges';

let counter = 0;
export function newId(prefix: string): string {
  counter = (counter + 1) % 1e6;
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${rnd}${counter.toString(36)}`;
}

export function createDesign(material: MaterialProfile = DEFAULT_MATERIAL): Design {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId('d'),
    name: '',
    material: { ...material },
    panels: {},
    order: [],
    connections: {},
    pieces: {},
    placements: {},
    trays: {},
    sheetSpacing: 3,
    sheetMargin: 5,
  };
}

export const MIN_PANEL = 5;

/** Grown connection that makes `panelId` a child, if any. */
export function parentConnection(d: Design, panelId: string): Connection | undefined {
  return Object.values(d.connections).find((c) => c.grown && c.b.panelId === panelId);
}

export function seatingOf(kind: ConnectionKind): Seating {
  return kind === 'finger' ? 'overlap' : 'onTop';
}

/** Use the preferred joint when it is allowed here, otherwise the default (first) one. */
export function fitKind(c: Connection, allowed: ConnectionKind[]) {
  c.pref ??= c.kind;
  c.kind = allowed.includes(c.pref) ? c.pref : allowed[0];
}

/**
 * Re-derive everything connections own: child frames and widths (parents
 * first), then every connection's joint geometry. A connection whose panels
 * no longer meet keeps its last valid geometry and is flagged `broken`.
 */
export function solve(d: Design) {
  const t = d.material.thickness;
  d.trays ??= {};
  for (const id of d.order) {
    const p = d.panels[id];
    if (!p) continue;
    p.sketch ??= parentConnection(d, id) ? { kind: 'wall' } : rectSketch(p.w, p.h);
    // a polygon sketch decides the bounding size
    if (p.sketch.kind === 'poly' && !isRectSketch(p)) {
      p.w = Math.max(...p.sketch.pts.map((q) => q.x));
      p.h = Math.max(...p.sketch.pts.map((q) => q.y));
    }
  }
  const done = new Set<string>(d.order.filter((id) => !parentConnection(d, id)));
  const pending = Object.values(d.connections).filter((c) => c.grown);
  let progress = true;
  while (pending.length && progress) {
    progress = false;
    for (let i = 0; i < pending.length; i++) {
      const c = pending[i];
      if (!done.has(c.a.panelId)) continue;
      pending.splice(i--, 1);
      progress = true;
      const parent = d.panels[c.a.panelId], child = d.panels[c.b.panelId];
      if (!parent || !child) continue;
      done.add(child.id);
      // the parent edge is gone (a vertex was deleted): keep the panel where it was, flagged
      if (!findEdge(parent, c.a.edge)) continue;
      fitKind(c, connectionsFor(d.material, c.angle));
      child.frame = growFrame(parent, c.a.edge, c.angle, c.dir, t, seatingOf(c.kind), c.offset);
      child.w = edgeLength(parent, c.a.edge);
      child.h = Math.max(child.h, MIN_PANEL);
      done.add(child.id);
    }
  }
  for (const c of Object.values(d.connections)) {
    if (!c.grown) {
      fitKind(c, seamKinds(d.material, seamTypeOf(c)));
    }
    const g = connectionGeom(d as Design, c as Connection);
    if (g) {
      c.geom = g;
      c.broken = false;
    } else c.broken = true;
  }
}

export function addRootPanel(d: Design, x: number, z: number, w: number, h: number): string {
  const id = newId('p');
  const n = d.order.length + 1;
  const pw = Math.max(MIN_PANEL, w), ph = Math.max(MIN_PANEL, h);
  d.panels[id] = { id, name: `${n}`, w: pw, h: ph, sketch: rectSketch(pw, ph), frame: GROUND_FRAME(x, z), details: [] };
  d.order.push(id);
  d.pieces[id] = { quantity: 1 };
  return id;
}

/** `pref`: the joint wanted whenever the angle allows it (default: `kind`). */
export type GrowOpts = { height: number; angle: number; dir: GrowDir; kind: ConnectionKind; offset?: number; pref?: ConnectionKind };

/** Default distance from the edge for a tab-and-slot wall: leaves a safe web outside its slots. */
export function defaultOffset(d: Design, kind: ConnectionKind): number {
  return kind === 'tabslot' ? Math.max(minWeb(d.material), d.material.thickness) : 0;
}

export function growPanel(d: Design, parentId: string, edgeArg: EdgeArg, opts: GrowOpts): { panelId: string; connectionId: string } | null {
  const parent = d.panels[parentId];
  const edge = ek(edgeArg);
  if (!parent || !findEdge(parent, edge)) return null;
  const offset = opts.offset ?? defaultOffset(d, opts.kind);
  if (offset === 0 && edgeConnection(d, parentId, edge)) return null;
  const id = newId('p');
  d.panels[id] = {
    id,
    name: `${d.order.length + 1}`,
    w: edgeLength(parent, edge),
    h: Math.max(MIN_PANEL, opts.height),
    sketch: { kind: 'wall' },
    frame: growFrame(parent, edge, opts.angle, opts.dir, d.material.thickness, seatingOf(opts.kind), offset),
    details: [],
  };
  d.order.push(id);
  d.pieces[id] = { quantity: 1 };
  const cid = newId('c');
  d.connections[cid] = {
    id: cid,
    kind: opts.kind,
    pref: opts.pref ?? opts.kind,
    a: { panelId: parentId, edge },
    b: { panelId: id, edge: 'e0' },
    grown: true,
    angle: opts.angle,
    dir: opts.dir,
    offset,
    fingers: null,
    tabs: null,
    flap: null,
    foldDir: opts.dir === 'up' ? 'valley' : 'mountain',
  };
  solve(d);
  // an angled plywood panel is held by side walls: connect to any that are there
  if (opts.kind === 'lean') connectSeams(d, id);
  return { panelId: id, connectionId: cid };
}

/** Connection using this edge at the edge itself (not a divider standing in from it). */
export function edgeConnection(d: Design, panelId: string, edgeArg: EdgeArg): Connection | undefined {
  const edge = ek(edgeArg);
  return Object.values(d.connections).find(
    (c) => (c.a.panelId === panelId && c.a.edge === edge && !(c.grown && c.offset > 0)) || (c.b.panelId === panelId && c.b.edge === edge),
  );
}

/**
 * Connect an open seam with the given (or default) kind. `auto` seams were
 * made by the editor and go away again when the panels stop meeting; a seam
 * the student connects by hand is kept (flagged broken) instead, and lifts
 * any earlier "don't join these" choice for the pair.
 */
export function connectSeam(d: Design, seam: OpenSeam, kind?: ConnectionKind, auto = true): string | null {
  const kinds = seamKinds(d.material, seam.type);
  const k = kind && kinds.includes(kind) ? kind : kinds[0];
  const cid = newId('c');
  // fingers: `a` must be the earlier panel, which owns the corners
  let a = seam.a, b = seam.b;
  if (seam.type === 'corner' && d.order.indexOf(a.panelId) > d.order.indexOf(b.panelId)) [a, b] = [b, a];
  d.connections[cid] = { id: cid, kind: k, pref: k, a, b, grown: false, angle: 90, dir: 'up', offset: 0, fingers: null, tabs: null, flap: null, foldDir: 'valley', auto };
  if (!auto && d.noAutoSeams) d.noAutoSeams = d.noAutoSeams.filter((x) => x !== pairKey(a.panelId, b.panelId));
  solve(d);
  return cid;
}

export const pairKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);

/**
 * Keep panels that meet joined, so the student does not have to: plywood
 * corners get finger joints, edges on a face tabs and slots, card and
 * corrugated corners glue flaps (so a folded tray stays one net). Run after
 * every edit. Automatic seams whose panels no longer meet are removed (and
 * come back when they meet again); seams the student made or changed by hand
 * are kept; pairs the student unjoined are left alone.
 */
export function autoConnect(d: Design) {
  let removed = false;
  for (const c of Object.values(d.connections))
    if (c.auto !== false && !c.grown && (c.broken || !seamStillFits(d, c))) {
      delete d.connections[c.id];
      removed = true;
    }
  if (removed) solve(d);
  if (d.noAutoSeams?.length) d.noAutoSeams = d.noAutoSeams.filter((k) => k.split('|').every((id) => d.panels[id]));
  const skip = new Set(d.noAutoSeams ?? []);
  for (let i = 0; i < 500; i++) {
    const s = findOpenSeams(d).find((x) => !skip.has(pairKey(x.a.panelId, x.b.panelId)));
    if (!s) break;
    skip.add(pairKey(s.a.panelId, s.b.panelId));
    connectSeam(d, s);
  }
}

/** Connect every open seam of a panel with default kinds (or `cornerKind` on corners, where allowed). */
export function connectSeams(d: Design, panelId: string, cornerKind?: ConnectionKind) {
  for (const s of findOpenSeams(d as Design, panelId)) connectSeam(d, s, s.type === 'corner' ? cornerKind : undefined);
}

/** Remove a connection. Unjoining meeting panels by hand also stops them being joined automatically. */
export function deleteConnection(d: Design, id: string) {
  const c = d.connections[id];
  if (!c) return;
  delete d.connections[id];
  if (!c.grown) d.noAutoSeams = [...new Set([...(d.noAutoSeams ?? []), pairKey(c.a.panelId, c.b.panelId)])];
  solve(d);
}

/**
 * Add a divider standing on `baseId`, parallel to `edge`, `position` mm in
 * from it. All its connections are generated together: tabs into base slots
 * (plywood) or resting on the base (paper), ends into the walls, half-laps
 * with crossing dividers.
 */
export function addDivider(d: Design, baseId: string, edge: EdgeArg, position: number, height: number): string | null {
  const kind: ConnectionKind = d.material.kind === 'plywood' ? 'tabslot' : 'butt';
  const r = growPanel(d, baseId, edge, { height, angle: 90, dir: 'up', kind, offset: Math.max(0.5, position) });
  if (!r) return null;
  connectSeams(d, r.panelId);
  return r.panelId;
}

/**
 * Add a pair of side walls at 90° to the base on the edges next to `edge`,
 * tall enough to hold a panel leaning at `angle` with the given height.
 */
export function addSideWalls(d: Design, baseId: string, edge: EdgeArg, angle: number, leanHeight: number, dir: GrowDir = 'up'): string[] {
  const t = d.material.thickness;
  const base = d.panels[baseId];
  const nb = base && edgeNeighbours(base, edge);
  if (!nb) return [];
  const h = Math.ceil(t + leanHeight * Math.sin((angle * Math.PI) / 180) + 5);
  const kind: ConnectionKind = d.material.kind === 'plywood' ? 'finger' : 'fold';
  const made: string[] = [];
  for (const e of [nb[1].key, nb[0].key]) {
    if (edgeConnection(d, baseId, e)) continue;
    const r = growPanel(d, baseId, e, { height: h, angle: 90, dir, kind });
    if (r) made.push(r.panelId);
  }
  // hold any panels already leaning on this base
  for (const c of Object.values(d.connections)) if (c.grown && c.kind === 'lean' && c.a.panelId === baseId) connectSeams(d, c.b.panelId);
  return made;
}

/** Side walls exist next to `edge` of the base (panels at 90° on both neighbouring edges, on the `dir` face). */
export function hasSideWalls(d: Design, baseId: string, edge: EdgeArg, dir: GrowDir = 'up'): boolean {
  const base = d.panels[baseId];
  const nb = base && edgeNeighbours(base, edge);
  if (!nb) return false;
  return [nb[1].key, nb[0].key].every((e) => {
    const c = edgeConnection(d, baseId, e);
    return !!c && c.grown && c.a.panelId === baseId && Math.abs(c.angle - 90) < 1e-6 && c.dir === dir;
  });
}

/** A leaning panel needs tab-and-slot seams on both side edges to be held. */
export function leanSupported(d: Design, panelId: string): boolean {
  return ['e1', 'e3'].every((e) =>
    Object.values(d.connections).some((c) => !c.grown && c.kind === 'tabslot' && !c.broken && c.a.panelId === panelId && c.a.edge === e),
  );
}

/**
 * Resize a panel. A connected child's width is owned by its parent's edge,
 * so a width change on a child is applied to the parent edge instead.
 */
export function setPanelSize(d: Design, panelId: string, w: number | undefined, h: number | undefined) {
  const p = d.panels[panelId];
  if (!p) return;
  if (w !== undefined) {
    const pc = parentConnection(d, panelId);
    if (pc) {
      const parent = d.panels[pc.a.panelId];
      if (parent) {
        const i = isRectSketch(parent) ? rectEdgeIndex(pc.a.edge) : null;
        if (i !== null) setPanelSize(d, parent.id, i % 2 === 0 ? w : undefined, i % 2 === 1 ? w : undefined);
        else setEdgeLength(d, parent.id, pc.a.edge, w);
      }
    } else scaleSketch(p, Math.max(MIN_PANEL, w), p.h);
  }
  if (h !== undefined) {
    if (parentConnection(d, panelId)) p.h = Math.max(MIN_PANEL, h);
    else scaleSketch(p, p.w, Math.max(MIN_PANEL, h));
  }
  solve(d);
}

/** Stretch a root panel's sketch to a new bounding size. */
function scaleSketch(p: Panel, w: number, h: number) {
  const s = sketchOf(p);
  if (s.kind === 'poly') {
    const ow = p.w, oh = p.h;
    s.pts = s.pts.map((q) => ({ x: (q.x / ow) * w, y: (q.y / oh) * h }));
    p.sketch = s;
  }
  p.w = w;
  p.h = h;
}

/** Lengthen or shorten one straight edge of a root polygon by moving its end vertex along it. */
export function setEdgeLength(d: Design, panelId: string, key: string, length: number) {
  const p = d.panels[panelId];
  const e = p && findEdge(p, key);
  if (!p || !e || p.sketch.kind !== 'poly' || parentConnection(d, panelId)) return;
  const i = p.sketch.edgeIds.indexOf(key);
  if (i < 0) return;
  const dir = segDir(e);
  const L = Math.max(MIN_PANEL, length);
  const n = p.sketch.pts.length;
  p.sketch.pts[(i + 1) % n] = { x: e.a.x + dir.x * L, y: e.a.y + dir.y * L };
  normalizeSketch(p);
}

/** Keep a root polygon's bounding box at the local origin (moving the frame to match) and its edges CCW. */
export function normalizeSketch(p: Panel) {
  const s = p.sketch;
  if (s.kind !== 'poly') return;
  const minX = Math.min(...s.pts.map((q) => q.x)), minY = Math.min(...s.pts.map((q) => q.y));
  if (Math.abs(minX) > 1e-9 || Math.abs(minY) > 1e-9) {
    s.pts = s.pts.map((q) => ({ x: q.x - minX, y: q.y - minY }));
    const f = p.frame;
    p.frame = { ...f, o: [f.o[0] + f.u[0] * minX + f.v[0] * minY, f.o[1] + f.u[1] * minX + f.v[1] * minY, f.o[2] + f.u[2] * minX + f.v[2] * minY] };
    for (const dt of p.details) {
      dt.cx -= minX;
      dt.cy -= minY;
    }
  }
  p.w = Math.max(...s.pts.map((q) => q.x));
  p.h = Math.max(...s.pts.map((q) => q.y));
}

export function movePanel(d: Design, panelId: string, dx: number, dz: number) {
  const p = d.panels[panelId];
  if (!p || parentConnection(d, panelId)) return;
  p.frame.o = [p.frame.o[0] + dx, p.frame.o[1], p.frame.o[2] + dz];
  solve(d);
}

/** Is a closed polygon simple (no two non-adjacent edges cross or touch) with some area? */
export function isSimplePolygon(pts: P2[]): boolean {
  const n = pts.length;
  if (n < 3 || Math.abs(polygonArea(pts)) < 1) return false;
  const cross = (o: P2, a: P2, b: P2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const hit = (p1: P2, p2: P2, q1: P2, q2: P2) => {
    const d1 = cross(q1, q2, p1), d2 = cross(q1, q2, p2), d3 = cross(p1, p2, q1), d4 = cross(p1, p2, q2);
    if (((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9))) return true;
    const on = (a: P2, b: P2, c: P2, dd: number) => Math.abs(dd) <= 1e-9 && Math.min(a.x, b.x) - 1e-9 <= c.x && c.x <= Math.max(a.x, b.x) + 1e-9 && Math.min(a.y, b.y) - 1e-9 <= c.y && c.y <= Math.max(a.y, b.y) + 1e-9;
    return on(q1, q2, p1, d1) || on(q1, q2, p2, d2) || on(p1, p2, q1, d3) || on(p1, p2, q2, d4);
  };
  for (let i = 0; i < n; i++) {
    if (Math.hypot(pts[(i + 1) % n].x - pts[i].x, pts[(i + 1) % n].y - pts[i].y) < 1e-6) return false;
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      if (hit(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return false;
    }
  }
  return true;
}

/** Vertices of a regular n-gon of circumradius r around (0, 0), with its first edge level at the bottom (turned by `rot` radians). */
export function regularPolygon(n: number, r: number, rot = 0): P2[] {
  const k = Math.max(3, Math.min(12, Math.round(n)));
  const a0 = -Math.PI / 2 - Math.PI / k + rot;
  return Array.from({ length: k }, (_, i) => ({ x: r * Math.cos(a0 + (2 * Math.PI * i) / k), y: r * Math.sin(a0 + (2 * Math.PI * i) / k) }));
}

/**
 * A base panel on the floor from a polygon (floor-local points: x along world
 * X, y along world −Z, relative to world (x, z)). Refused when it crosses itself.
 */
export function addPolygonPanel(d: Design, x: number, z: number, pts: P2[]): string | null {
  let q = pts.map((p) => ({ x: p.x, y: p.y }));
  if (!isSimplePolygon(q)) return null;
  if (polygonArea(q) < 0) q = q.reverse();
  const minX = Math.min(...q.map((p) => p.x)), minY = Math.min(...q.map((p) => p.y));
  q = q.map((p) => ({ x: p.x - minX, y: p.y - minY }));
  const id = addRootPanel(d, x + minX, z - minY, 10, 10);
  const p = d.panels[id];
  p.sketch = { kind: 'poly', pts: q, edgeIds: q.map((_, i) => `e${i}`) };
  normalizeSketch(p);
  solve(d);
  return id;
}

/** Next unused sketch edge id of a polygon. */
function nextEdgeId(ids: string[]): string {
  let n = 0;
  for (const k of ids) {
    const m = /^e(\d+)$/.exec(k);
    if (m) n = Math.max(n, Number(m[1]) + 1);
  }
  return `e${n}`;
}

/** Move vertex i of a root polygon (local coordinates). Refused if the outline would cross itself. */
export function moveVertex(d: Design, panelId: string, i: number, to: P2): boolean {
  const p = d.panels[panelId];
  if (!p || p.sketch.kind !== 'poly' || parentConnection(d, panelId)) return false;
  const pts = p.sketch.pts.map((q, k) => (k === i ? { x: to.x, y: to.y } : q));
  if (!isSimplePolygon(pts) || polygonArea(pts) <= 0) return false;
  p.sketch.pts = pts;
  normalizeSketch(p);
  solve(d);
  return true;
}

/**
 * Insert a vertex on edge i of a root polygon at fraction `t` along it. The
 * first half keeps the edge's id, the second half gets a new one.
 */
export function insertVertex(d: Design, panelId: string, i: number, t = 0.5): string | null {
  const p = d.panels[panelId];
  if (!p || p.sketch.kind !== 'poly' || parentConnection(d, panelId)) return null;
  const s = p.sketch;
  const n = s.pts.length;
  const a = s.pts[i], b = s.pts[(i + 1) % n];
  const id = nextEdgeId(s.edgeIds);
  s.pts.splice(i + 1, 0, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  s.edgeIds.splice(i + 1, 0, id);
  solve(d);
  return id;
}

/** Delete vertex i of a root polygon (at least three stay); the edge before it absorbs the edge after it. */
export function deleteVertex(d: Design, panelId: string, i: number): boolean {
  const p = d.panels[panelId];
  if (!p || p.sketch.kind !== 'poly' || p.sketch.pts.length <= 3 || parentConnection(d, panelId)) return false;
  const s = p.sketch;
  const pts = s.pts.filter((_, k) => k !== i);
  if (!isSimplePolygon(pts) || polygonArea(pts) <= 0) return false;
  s.pts = pts;
  s.edgeIds.splice(i, 1);
  normalizeSketch(p);
  solve(d);
  return true;
}

export function deletePanel(d: Design, panelId: string) {
  for (const c of Object.values(d.connections)) {
    if (c.a.panelId === panelId || c.b.panelId === panelId) delete d.connections[c.id];
  }
  delete d.panels[panelId];
  delete d.pieces[panelId];
  d.order = d.order.filter((id) => id !== panelId);
  for (const k of Object.keys(d.placements)) if (k.startsWith(panelId + '#')) delete d.placements[k];
  solve(d);
}

export function addDetail(d: Design, panelId: string, shape: DetailShape, op: DetailOp, cx: number, cy: number, w: number, h: number, fixedId?: string): string | null {
  const p = d.panels[panelId];
  if (!p) return null;
  const id = fixedId ?? newId('x');
  const dt: Detail = { id, shape, op, cx, cy, w: Math.max(0.5, w), h: Math.max(0.5, shape === 'circle' ? w : h) };
  if (shape === 'roundrect') dt.r = Math.min(dt.w, dt.h) / 4;
  p.details.push(dt);
  return id;
}

/** Place a text shape (engraved by default) centred at (cx, cy). */
export function addText(d: Design, panelId: string, cx: number, cy: number, value: string, op: DetailOp = 'engrave', font = 'rubik', size = 10, fixedId?: string): string | null {
  const p = d.panels[panelId];
  if (!p) return null;
  const id = fixedId ?? newId('x');
  p.details.push({ id, shape: 'text', op, cx, cy, w: size * value.length * 0.55, h: size, text: { value, font, size } });
  return id;
}

/** Place an imported vector shape (polygons in a unit box) at (cx, cy), w × h mm. */
export function addPathShape(d: Design, panelId: string, polys: { x: number; y: number }[][], cx: number, cy: number, w: number, h: number, op: DetailOp): string | null {
  const p = d.panels[panelId];
  if (!p) return null;
  const id = newId('x');
  p.details.push({ id, shape: 'path', op, cx, cy, w, h, path: { polys } });
  return id;
}

/**
 * A polygon shape on a panel from panel-local points, stored like an imported
 * path (points in a unit box scaled to w × h), so move, resize, array, align
 * and snapping treat it like any other shape.
 */
export function addPolygonShape(d: Design, panelId: string, pts: P2[], op: DetailOp, regular?: number, fixedId?: string): string | null {
  const p = d.panels[panelId];
  if (!p || !isSimplePolygon(pts)) return null;
  const q = polygonArea(pts) < 0 ? [...pts].reverse() : pts;
  const xs = q.map((v) => v.x), ys = q.map((v) => v.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const w = Math.max(0.5, maxX - minX), h = Math.max(0.5, maxY - minY);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const id = fixedId ?? newId('x');
  const dt: Detail = { id, shape: 'polygon', op, cx, cy, w, h, path: { polys: [q.map((v) => ({ x: (v.x - cx) / w, y: (v.y - cy) / h }))] } };
  if (regular) dt.regular = { n: regular };
  p.details.push(dt);
  return id;
}

export function setText(d: Design, detailId: string, patch: Partial<{ value: string; font: string; size: number }>) {
  const f = findDetail(d, detailId);
  if (!f || !f.detail.text) return;
  Object.assign(f.detail.text, patch);
  f.detail.text.size = Math.max(1, Math.min(500, f.detail.text.size));
}

export function findDetail(d: Design, detailId: string): { panel: Panel; detail: Detail } | null {
  for (const id of d.order) {
    const panel = d.panels[id];
    const detail = panel?.details.find((x) => x.id === detailId);
    if (panel && detail) return { panel, detail };
  }
  return null;
}

export function updateDetail(d: Design, detailId: string, patch: Partial<Pick<Detail, 'cx' | 'cy' | 'w' | 'h' | 'r' | 'op'>>) {
  const f = findDetail(d, detailId);
  if (!f) return;
  const dt = f.detail;
  Object.assign(dt, patch);
  dt.w = Math.max(0.5, dt.w);
  dt.h = Math.max(0.5, dt.h);
  if (dt.shape === 'circle') {
    if (patch.h !== undefined && patch.w === undefined) dt.w = dt.h;
    dt.h = dt.w;
  }
  if (dt.r !== undefined) dt.r = Math.max(0, Math.min(dt.r, dt.w / 2, dt.h / 2));
}

export function deleteDetail(d: Design, detailId: string) {
  for (const id of d.order) {
    const p = d.panels[id];
    if (p) p.details = p.details.filter((x) => x.id !== detailId);
  }
}

export function setMaterial(d: Design, m: MaterialProfile) {
  d.material = { ...m };
  solve(d);
}

export type ConnPatch = Partial<Pick<Connection, 'kind' | 'fingers' | 'tabs' | 'flap' | 'foldDir' | 'angle' | 'offset' | 'dir'>>;

export function setConnection(d: Design, connectionId: string, patch: ConnPatch) {
  const c = d.connections[connectionId];
  if (!c) return;
  if (patch.angle !== undefined && c.grown) {
    c.angle = patch.angle;
    fitKind(c, connectionsFor(d.material, c.angle));
  }
  if (patch.kind) {
    const allowed = c.grown ? connectionsFor(d.material, c.angle) : seamKinds(d.material, seamTypeOf(c));
    if (allowed.includes(patch.kind)) {
      c.kind = patch.kind;
      c.pref = patch.kind;
      c.auto = false;
      if (c.grown && c.kind !== 'tabslot' && patch.offset === undefined && c.offset > 0 && !isDividerOffset(d, c)) c.offset = 0;
      if (c.grown && c.kind === 'tabslot' && c.offset === 0) c.offset = defaultOffset(d, 'tabslot');
    }
  }
  if (patch.fingers !== undefined) c.fingers = patch.fingers === null ? null : Math.max(3, Math.round(patch.fingers) | 1);
  if (patch.tabs !== undefined) c.tabs = patch.tabs === null ? null : Math.max(1, Math.round(patch.tabs));
  if (patch.flap !== undefined) c.flap = patch.flap === null ? null : Math.max(3, patch.flap);
  if (patch.foldDir) c.foldDir = patch.foldDir;
  if (patch.dir && c.grown) c.dir = patch.dir;
  if (patch.offset !== undefined && c.grown) c.offset = Math.max(0, patch.offset);
  solve(d);
  if (c.grown && c.kind === 'lean') connectSeams(d, c.b.panelId);
}

/** A grown connection standing well inside its parent (a divider), not at the edge. */
function isDividerOffset(d: Design, c: Connection) {
  return c.offset > 2 * d.material.thickness + minWeb(d.material);
}
