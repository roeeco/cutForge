// Pure model operations. Each takes a Design (an immer draft when called
// from the store) and mutates it. `solve` re-derives everything that is
// owned by connections, so every operation ends with a consistent design.
import type { Connection, ConnectionKind, Design, Detail, DetailShape, DetailOp, MaterialProfile, Panel } from './types';
import { SCHEMA_VERSION } from './types';
import { DEFAULT_MATERIAL, connectionsFor, minWeb } from './materials';
import { edgeLength, growFrame, GROUND_FRAME, type GrowDir, type Seating } from './frame';
import { connectionGeom, findOpenSeams, seamKinds, type OpenSeam } from './seams';

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

/**
 * Re-derive everything connections own: child frames and widths (parents
 * first), then every connection's joint geometry. A connection whose panels
 * no longer meet keeps its last valid geometry and is flagged `broken`.
 */
export function solve(d: Design) {
  const t = d.material.thickness;
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
      if (!connectionsFor(d.material, c.angle).includes(c.kind)) c.kind = connectionsFor(d.material, c.angle)[0];
      child.frame = growFrame(parent, c.a.edge, c.angle, c.dir, t, seatingOf(c.kind), c.offset);
      child.w = edgeLength(parent, c.a.edge);
      child.h = Math.max(child.h, MIN_PANEL);
      done.add(child.id);
    }
  }
  for (const c of Object.values(d.connections)) {
    if (!c.grown) {
      const type = c.kind === 'halflap' ? 'cross' : c.b.edge >= 0 ? 'corner' : 'face';
      const kinds = seamKinds(d.material, type);
      if (!kinds.includes(c.kind)) c.kind = kinds[0];
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
  d.panels[id] = { id, name: `${n}`, w: Math.max(MIN_PANEL, w), h: Math.max(MIN_PANEL, h), frame: GROUND_FRAME(x, z), details: [] };
  d.order.push(id);
  d.pieces[id] = { quantity: 1 };
  return id;
}

export type GrowOpts = { height: number; angle: number; dir: GrowDir; kind: ConnectionKind; offset?: number };

/** Default distance from the edge for a tab-and-slot wall: leaves a safe web outside its slots. */
export function defaultOffset(d: Design, kind: ConnectionKind): number {
  return kind === 'tabslot' ? Math.max(minWeb(d.material), d.material.thickness) : 0;
}

export function growPanel(d: Design, parentId: string, edge: number, opts: GrowOpts): { panelId: string; connectionId: string } | null {
  const parent = d.panels[parentId];
  if (!parent) return null;
  const offset = opts.offset ?? defaultOffset(d, opts.kind);
  if (offset === 0 && edgeConnection(d, parentId, edge)) return null;
  const id = newId('p');
  d.panels[id] = {
    id,
    name: `${d.order.length + 1}`,
    w: edgeLength(parent, edge),
    h: Math.max(MIN_PANEL, opts.height),
    frame: growFrame(parent, edge, opts.angle, opts.dir, d.material.thickness, seatingOf(opts.kind), offset),
    details: [],
  };
  d.order.push(id);
  d.pieces[id] = { quantity: 1 };
  const cid = newId('c');
  d.connections[cid] = {
    id: cid,
    kind: opts.kind,
    a: { panelId: parentId, edge },
    b: { panelId: id, edge: 0 },
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
export function edgeConnection(d: Design, panelId: string, edge: number): Connection | undefined {
  return Object.values(d.connections).find(
    (c) => (c.a.panelId === panelId && c.a.edge === edge && !(c.grown && c.offset > 0)) || (c.b.panelId === panelId && c.b.edge === edge),
  );
}

/** Connect an open seam with the given (or default) kind. */
export function connectSeam(d: Design, seam: OpenSeam, kind?: ConnectionKind): string | null {
  const kinds = seamKinds(d.material, seam.type);
  const k = kind && kinds.includes(kind) ? kind : kinds[0];
  const cid = newId('c');
  // fingers: `a` must be the earlier panel, which owns the corners
  let a = seam.a, b = seam.b;
  if (seam.type === 'corner' && d.order.indexOf(a.panelId) > d.order.indexOf(b.panelId)) [a, b] = [b, a];
  d.connections[cid] = { id: cid, kind: k, a, b, grown: false, angle: 90, dir: 'up', offset: 0, fingers: null, tabs: null, flap: null, foldDir: 'valley' };
  solve(d);
  return cid;
}

/** Connect every open seam of a panel with default kinds. */
export function connectSeams(d: Design, panelId: string) {
  for (const s of findOpenSeams(d as Design, panelId)) connectSeam(d, s);
}

export function deleteConnection(d: Design, id: string) {
  const c = d.connections[id];
  if (!c) return;
  delete d.connections[id];
  solve(d);
}

/**
 * Add a divider standing on `baseId`, parallel to `edge`, `position` mm in
 * from it. All its connections are generated together: tabs into base slots
 * (plywood) or resting on the base (paper), ends into the walls, half-laps
 * with crossing dividers.
 */
export function addDivider(d: Design, baseId: string, edge: number, position: number, height: number): string | null {
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
export function addSideWalls(d: Design, baseId: string, edge: number, angle: number, leanHeight: number): string[] {
  const t = d.material.thickness;
  const h = Math.ceil(t + leanHeight * Math.sin((angle * Math.PI) / 180) + 5);
  const kind: ConnectionKind = d.material.kind === 'plywood' ? 'finger' : 'fold';
  const made: string[] = [];
  for (const e of [(edge + 1) % 4, (edge + 3) % 4]) {
    if (edgeConnection(d, baseId, e)) continue;
    const r = growPanel(d, baseId, e, { height: h, angle: 90, dir: 'up', kind });
    if (r) made.push(r.panelId);
  }
  // hold any panels already leaning on this base
  for (const c of Object.values(d.connections)) if (c.grown && c.kind === 'lean' && c.a.panelId === baseId) connectSeams(d, c.b.panelId);
  return made;
}

/** Side walls exist next to `edge` of the base (panels at 90° on both neighbouring edges). */
export function hasSideWalls(d: Design, baseId: string, edge: number): boolean {
  return [(edge + 1) % 4, (edge + 3) % 4].every((e) => {
    const c = edgeConnection(d, baseId, e);
    return !!c && c.grown && c.a.panelId === baseId && Math.abs(c.angle - 90) < 1e-6;
  });
}

/** A leaning panel needs tab-and-slot seams on both side edges to be held. */
export function leanSupported(d: Design, panelId: string): boolean {
  return [1, 3].every((e) =>
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
      if (parent) setPanelSize(d, parent.id, pc.a.edge % 2 === 0 ? w : undefined, pc.a.edge % 2 === 1 ? w : undefined);
    } else p.w = Math.max(MIN_PANEL, w);
  }
  if (h !== undefined) p.h = Math.max(MIN_PANEL, h);
  solve(d);
}

export function movePanel(d: Design, panelId: string, dx: number, dz: number) {
  const p = d.panels[panelId];
  if (!p || parentConnection(d, panelId)) return;
  p.frame.o = [p.frame.o[0] + dx, p.frame.o[1], p.frame.o[2] + dz];
  solve(d);
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
    if (!connectionsFor(d.material, c.angle).includes(c.kind)) c.kind = connectionsFor(d.material, c.angle)[0];
  }
  if (patch.kind) {
    const allowed = c.grown
      ? connectionsFor(d.material, c.angle)
      : seamKinds(d.material, c.kind === 'halflap' ? 'cross' : c.b.edge >= 0 ? 'corner' : 'face');
    if (allowed.includes(patch.kind)) {
      c.kind = patch.kind;
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
