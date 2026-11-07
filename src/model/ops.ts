// Pure model operations. Each takes a Design (an immer draft when called
// from the store) and mutates it. `solve` re-derives everything that is
// owned by connections, so every operation ends with a consistent design.
import type { Connection, ConnectionKind, Design, Detail, DetailShape, DetailOp, MaterialProfile, Panel } from './types';
import { SCHEMA_VERSION } from './types';
import { DEFAULT_MATERIAL, connectionsFor } from './materials';
import { edgeLength, growFrame, GROUND_FRAME, type GrowDir } from './frame';

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

/** Connection that makes `panelId` a child, if any. */
export function parentConnection(d: Design, panelId: string): Connection | undefined {
  return Object.values(d.connections).find((c) => c.b.panelId === panelId);
}

/** Re-derive child frames and sizes from their connections (parents first). */
export function solve(d: Design) {
  const t = d.material.thickness;
  const done = new Set<string>(d.order.filter((id) => !parentConnection(d, id)));
  const pending = Object.values(d.connections);
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
      child.frame = growFrame(parent, c.a.edge, c.angle, c.dir, t);
      child.w = edgeLength(parent, c.a.edge);
      child.h = Math.max(child.h, MIN_PANEL);
      if (!connectionsFor(d.material, c.angle).includes(c.kind)) c.kind = 'butt';
      done.add(child.id);
    }
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

export function growPanel(
  d: Design,
  parentId: string,
  edge: number,
  opts: { height: number; angle: number; dir: GrowDir; kind: ConnectionKind },
): { panelId: string; connectionId: string } | null {
  const parent = d.panels[parentId];
  if (!parent) return null;
  const taken = Object.values(d.connections).some(
    (c) => (c.a.panelId === parentId && c.a.edge === edge) || (c.b.panelId === parentId && c.b.edge === edge),
  );
  if (taken) return null;
  const id = newId('p');
  d.panels[id] = {
    id,
    name: `${d.order.length + 1}`,
    w: edgeLength(parent, edge),
    h: Math.max(MIN_PANEL, opts.height),
    frame: growFrame(parent, edge, opts.angle, opts.dir, d.material.thickness),
    details: [],
  };
  d.order.push(id);
  d.pieces[id] = { quantity: 1 };
  const cid = newId('c');
  d.connections[cid] = { id: cid, kind: opts.kind, a: { panelId: parentId, edge }, b: { panelId: id, edge: 0 }, angle: opts.angle, dir: opts.dir, fingers: null };
  solve(d);
  return { panelId: id, connectionId: cid };
}

/** Edge of `panelId` already used by a connection. */
export function edgeConnection(d: Design, panelId: string, edge: number): Connection | undefined {
  return Object.values(d.connections).find(
    (c) => (c.a.panelId === panelId && c.a.edge === edge) || (c.b.panelId === panelId && c.b.edge === edge),
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

export function setConnection(d: Design, connectionId: string, patch: Partial<Pick<Connection, 'kind' | 'fingers'>>) {
  const c = d.connections[connectionId];
  if (!c) return;
  if (patch.kind && connectionsFor(d.material, c.angle).includes(patch.kind)) c.kind = patch.kind;
  if (patch.fingers !== undefined) c.fingers = patch.fingers === null ? null : Math.max(3, Math.round(patch.fingers) | 1);
  solve(d);
}
