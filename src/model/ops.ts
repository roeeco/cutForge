// Pure model operations. Each takes a Design (an immer draft when called
// from the store) and mutates it. `solve` re-derives everything that is
// owned by connections, so every operation ends with a consistent design.
// shapes feed the edge layer: make sure the own-outline hook is installed
import './outline';
import type { Connection, ConnectionKind, Design, Detail, DetailShape, DetailOp, DividerSet, FoldOver, MaterialProfile, P2, Panel, Tray, WallCorner, WallInsert, WallSketch } from './types';
import { insideCornerExtensions, reconcileTrays, trayKinds, trayOf, trayWalls, wallHeight } from './trays';
import { clearBox, memberOf, reconcileDividerSets, renamePanel } from './dividers';
import { polygonArea } from '../geom/vec';
import { SCHEMA_VERSION } from './types';
import { DEFAULT_MATERIAL, connectionsFor, minWeb } from './materials';
import { edgeLength, growFrame, GROUND_FRAME, matDir as matDirOf, toWorld as toWorldOfFrame, type GrowDir, type Seating } from './frame';
import { panelEdges as panelEdgesOf } from './edges';
const toWorldOf = (p: Panel, x: number, y: number) => toWorldOfFrame(p.frame, x, y);
import { baseKey, connectionGeom, findOpenSeams, minContact, seamContact, seamKey, seamKinds, seamStillFits, seamTypeOf, type OpenSeam } from './seams';
import { edgeNeighbours, edgePieces, ek, findEdge, isRectSketch, rectEdgeIndex, rectSketch, segDir, segLength, sketchOf, type EdgeArg } from './edges';

/** Deep copy that also works on immer drafts (structuredClone cannot clone a draft). */
const plain = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

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
  reconcileWallSets(d);
  reconcileTrays(d, makeTrayWall);
  reconcileDividerSets(d);
  insideCornerExtensions(
    d,
    (baseId, key) => {
      const base = d.panels[baseId];
      const c = Object.values(d.connections).find((x) => x.grown && x.a.panelId === baseId && x.offset === 0 && Math.abs(x.angle - 90) < 1e-6 && (x.a.edge === key || (base && findEdge(base, x.a.edge)?.key === key)));
      return c?.b.panelId;
    },
    (a, b) => Object.values(d.connections).find((x) => !x.grown && ((x.a.panelId === a && x.b.panelId === b) || (x.a.panelId === b && x.b.panelId === a)))?.kind,
  );
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
      delete c.thin;
    } else {
      c.broken = true;
      const contact = seamContact(d as Design, c as Connection);
      if (contact > 0 && contact < minContact(d as Design, c)) c.thin = true;
      else delete c.thin;
    }
  }
}

/** A wall of a wall set derived from `<wallId>` for piece n of its edge: `<wallId>~n`. */
export const derivedOf = (id: string): { base: string; n: number } | null => {
  const m = /^(.*)~(\d+)$/.exec(id);
  return m ? { base: m[1], n: Number(m[2]) } : null;
};

/** World point of a panel-local point. */
const worldAt = (p: Panel, x: number, y: number) => {
  const f = p.frame;
  return [f.o[0] + f.u[0] * x + f.v[0] * y, f.o[1] + f.u[1] * x + f.v[1] * y, f.o[2] + f.u[2] * x + f.v[2] * y] as [number, number, number];
};

/**
 * Wall sets (POLYGONS_AND_CUTS.md §6): a wall is attached to an edge key, and
 * one physical wall stands on each surviving piece of that edge. When a cut
 * splits the edge, wall `<id>~n` is made for piece n with the wall's settings
 * and the shapes whose centre lies on that piece; the set keeps one height,
 * angle and joint. When a piece disappears, its wall is removed if it has no
 * shapes of its own, and otherwise kept and flagged broken.
 */
export function reconcileWallSets(d: Design) {
  for (const c of Object.values(d.connections)) {
    if (!c.grown || c.a.edge.includes('#') || derivedOf(c.b.panelId)) continue;
    const parent = d.panels[c.a.panelId], wall = d.panels[c.b.panelId];
    if (!parent || !wall) continue;
    const pieces = edgePieces(parent, c.a.edge);
    const split = pieces.length > 1 && pieces[0].key.includes('#');
    for (let n = 1; n < (split ? pieces.length : 1); n++) {
      const id = `${wall.id}~${n}`;
      const cid = `${c.id}~${n}`;
      if (!d.panels[id]) {
        const dir = segDir(pieces[0]);
        const s0 = (pieces[n].a.x - pieces[0].a.x) * dir.x + (pieces[n].a.y - pieces[0].a.y) * dir.y;
        const L = segLength(pieces[n]);
        const moved = wall.details.filter((dt) => dt.cx >= s0 - 1e-9 && dt.cx <= s0 + L + 1e-9);
        wall.details = wall.details.filter((dt) => !moved.includes(dt));
        d.panels[id] = { ...plain({ ...wall, details: [] }), id, details: moved.map((dt) => ({ ...dt, cx: dt.cx - s0 })) };
        const at = d.order.indexOf(wall.id);
        d.order.splice(at + n, 0, id);
        d.pieces[id] = { quantity: d.pieces[wall.id]?.quantity ?? 1 };
      }
      d.panels[id].broken = false;
      if (!d.connections[cid]) d.connections[cid] = { ...plain({ ...c, geom: undefined }), id: cid, a: { panelId: parent.id, edge: `${c.a.edge}#${n}` }, b: { panelId: id, edge: 'e0' } };
      // one set: the same height, angle and joint
      const dc = d.connections[cid];
      Object.assign(dc, { kind: c.kind, pref: c.pref, angle: c.angle, dir: c.dir, offset: c.offset, fingers: c.fingers, tabs: c.tabs, flap: c.flap, foldDir: c.foldDir, trayId: c.trayId });
      d.panels[id].h = wall.h;
    }
    // derived walls whose piece is gone
    for (const id of [...d.order]) {
      const dv = derivedOf(id);
      if (!dv || dv.base !== wall.id || (split && dv.n < pieces.length)) continue;
      const p = d.panels[id];
      if (!p) continue;
      if (!p.details.length && !Object.values(d.connections).some((x) => x.grown && x.a.panelId === id)) {
        for (const x of Object.values(d.connections)) if (x.a.panelId === id || x.b.panelId === id) delete d.connections[x.id];
        delete d.panels[id];
        delete d.pieces[id];
        d.order = d.order.filter((x) => x !== id);
      } else p.broken = true;
    }
  }
}

/** Stand a tray wall on a base edge (reconciliation): stable ids `<tray>/<edge>`. */
function makeTrayWall(d: Design, tray: Tray, edge: string) {
  const base = d.panels[tray.baseId];
  if (!base) return;
  const id = `${tray.id}/${edge}`, cid = `${tray.id}/c/${edge}`;
  const kind = tray.wallKind;
  if (!d.panels[id]) {
    d.panels[id] = { id, name: `${d.order.length + 1}`, w: edgeLength(base, edge), h: Math.max(MIN_PANEL, wallHeight(d, kind, tray.height)), sketch: { kind: 'wall' }, frame: base.frame, details: [] };
    d.order.push(id);
    d.pieces[id] = { quantity: 1 };
  }
  if (!d.connections[cid])
    d.connections[cid] = {
      id: cid,
      kind,
      pref: kind,
      a: { panelId: base.id, edge },
      b: { panelId: id, edge: 'e0' },
      grown: true,
      angle: 90,
      dir: 'up',
      offset: defaultOffset(d, kind),
      fingers: null,
      tabs: null,
      flap: null,
      foldDir: 'valley',
      trayId: tray.id,
    };
}

/**
 * Extrude a base into a tray: a wall at 90° on every straight edge, all at
 * outer height `height`, with the material's default wall and corner joints.
 */
export function addTray(d: Design, baseId: string, height: number, kinds?: Partial<Pick<Tray, 'wallKind' | 'cornerKind'>>): string | null {
  const base = d.panels[baseId];
  if (!base || parentConnection(d, baseId) || Object.values(d.trays ?? {}).some((t) => t.baseId === baseId)) return null;
  const id = newId('tr');
  d.trays ??= {};
  d.trays[id] = { id, baseId, height: Math.max(MIN_PANEL + d.material.thickness, height), ...trayKinds(d.material), ...kinds, openEdges: [] };
  solve(d);
  for (const w of trayWalls(d, id)) connectSeams(d, w);
  return id;
}

/** Change a tray's shared outer height (walls with their own height keep it). */
export function setTrayHeight(d: Design, trayId: string, height: number) {
  const tray = d.trays?.[trayId];
  if (!tray) return;
  tray.height = Math.max(MIN_PANEL + d.material.thickness, height);
  solve(d);
}

/** Change a tray's wall-to-base or corner joint (or its tab length) for all its walls and corners. */
export function setTrayKinds(d: Design, trayId: string, patch: Partial<Pick<Tray, 'wallKind' | 'cornerKind' | 'tabLen'>>) {
  const tray = d.trays?.[trayId];
  if (!tray) return;
  Object.assign(tray, patch);
  if (patch.tabLen) for (const c of Object.values(d.connections)) if (c.trayId === trayId && !c.grown) {
    if (patch.tabLen === 'through') c.tabLen = 'through';
    else delete c.tabLen;
  }
  for (const c of Object.values(d.connections)) {
    if (c.trayId !== trayId) continue;
    if (c.grown && patch.wallKind) {
      c.kind = c.pref = patch.wallKind;
      c.offset = defaultOffset(d, patch.wallKind);
    } else if (!c.grown && patch.cornerKind && seamKinds(d.material, seamTypeOf(c)).includes(patch.cornerKind)) c.kind = c.pref = patch.cornerKind;
  }
  solve(d);
}

/** Put a wall back on an open tray edge. */
export function wallIt(d: Design, trayId: string, edge: string) {
  const tray = d.trays?.[trayId];
  if (!tray) return;
  tray.openEdges = tray.openEdges.filter((k) => k !== edge);
  solve(d);
  const w = `${trayId}/${edge}`;
  if (d.panels[w]) connectSeams(d, w);
}

/** A tray wall's own height on or off (off: back to the tray's height). */
export function setCustomHeight(d: Design, wallId: string, on: boolean) {
  const w = d.panels[wallId];
  if (!w) return;
  if (on) w.customHeight = true;
  else delete w.customHeight;
  solve(d);
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
  // tray corners use the tray's corner joint
  const ta = trayOf(d, seam.a.panelId), tb = trayOf(d, seam.b.panelId);
  const tray = ta && tb && ta.id === tb.id && ta.baseId !== seam.a.panelId && ta.baseId !== seam.b.panelId ? ta : undefined;
  if (!kind && tray && seam.type === 'corner') kind = tray.cornerKind;
  const k = kind && kinds.includes(kind) ? kind : kinds[0];
  const cid = newId('c');
  // fingers: `a` must be the earlier panel, which owns the corners
  // a seam is kept on whole edges: its joint lays out over every piece of an edge a cut split
  let a = { ...seam.a, edge: baseKey(seam.a.edge) }, b = { ...seam.b, edge: baseKey(seam.b.edge) };
  if (seam.type === 'corner' && d.order.indexOf(a.panelId) > d.order.indexOf(b.panelId)) [a, b] = [b, a];
  d.connections[cid] = { id: cid, kind: k, pref: k, a, b, grown: false, angle: 90, dir: 'up', offset: 0, fingers: null, tabs: null, flap: null, foldDir: 'valley', auto, ...(tray ? { trayId: tray.id } : {}), ...(tray?.tabLen === 'through' ? { tabLen: 'through' as const } : {}) };
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
    if (c.auto !== false && !c.grown && ((c.broken && !c.thin) || !seamStillFits(d, c))) {
      delete d.connections[c.id];
      removed = true;
    }
  if (removed) solve(d);
  if (d.noAutoSeams?.length) d.noAutoSeams = d.noAutoSeams.filter((k) => k.split('|').every((id) => d.panels[id]));
  const skip = new Set(d.noAutoSeams ?? []);
  const tried = new Set<string>();
  for (let i = 0; i < 500; i++) {
    const s = findOpenSeams(d).find((x) => !skip.has(pairKey(x.a.panelId, x.b.panelId)) && !tried.has(seamKey(x)));
    if (!s) break;
    tried.add(seamKey(s));
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

/** The divider set on a base, if any. */
export function dividerSetOf(d: Design, baseId: string): DividerSet | undefined {
  return Object.values(d.dividerSets ?? {}).find((s) => s.baseId === baseId);
}

/** Can a base take automatic dividers? A rectangle with a clear inside. */
export function canDividerSet(d: Design, baseId: string): boolean {
  const b = clearBox(d, baseId);
  return !!b && b.x1 - b.x0 > 10 && b.y1 - b.y0 > 10;
}

/**
 * Make or change the automatic dividers on a base (counts across and along,
 * height, even or by compartment size). Counts of 0 and 0 remove the set.
 */
export function setDividerSet(d: Design, baseId: string, patch: Partial<Pick<DividerSet, 'across' | 'along' | 'height' | 'mode' | 'size'>>): string | null {
  if (!canDividerSet(d, baseId)) return null;
  d.dividerSets ??= {};
  let set = dividerSetOf(d, baseId);
  if (!set) {
    const id = `${baseId}/div`;
    const walls = Object.values(d.connections).filter((c) => c.grown && c.a.panelId === baseId).map((c) => d.panels[c.b.panelId]?.h ?? 40);
    const h = Math.max(10, Math.round((walls.length ? Math.min(...walls) : 40) - d.material.thickness - 5));
    set = d.dividerSets[id] = { id, baseId, across: 0, along: 0, height: h, mode: 'even' };
  }
  Object.assign(set, patch);
  set.across = Math.max(0, Math.min(20, Math.round(set.across)));
  set.along = Math.max(0, Math.min(20, Math.round(set.along)));
  if (set.mode === 'size') set.size = Math.max(5, set.size ?? 30);
  const id = set.id;
  if (!set.across && !set.along) {
    // an empty set: its dividers go (ones placed by hand stay, as ordinary dividers)
    for (const pid of d.order.filter((x) => memberOf(d, x)?.set.id === id)) {
      for (const c of Object.values(d.connections)) if (c.a.panelId === pid || c.b.panelId === pid) delete d.connections[c.id];
      delete d.panels[pid];
      delete d.pieces[pid];
    }
    d.order = d.order.filter((x) => d.panels[x]);
    delete d.dividerSets[id];
  }
  solve(d);
  if (d.dividerSets[id]) for (const pid of d.order.filter((x) => memberOf(d, x)?.set.id === id)) connectSeams(d, pid);
  return d.dividerSets[id] ? id : null;
}

/**
 * Take a divider out of its set (it was dragged by hand), keeping where it is:
 * it is renamed `to`, the members after it move down one, and the set has one
 * fewer (by-size spacing becomes even spacing with the rest).
 */
export function releaseDivider(d: Design, panelId: string, to: string): string {
  const m = memberOf(d, panelId);
  if (!m) return panelId;
  const { set, axis, n } = m;
  const count = axis === 'a' ? set.across : set.along;
  if (set.mode === 'size') {
    set.mode = 'even';
    const box = clearBox(d, set.baseId);
    set.across = d.order.filter((x) => memberOf(d, x)?.set.id === set.id && memberOf(d, x)?.axis === 'a').length;
    set.along = d.order.filter((x) => memberOf(d, x)?.set.id === set.id && memberOf(d, x)?.axis === 'l').length;
    void box;
  }
  renamePanel(d, panelId, to);
  for (let k = n + 1; k <= count; k++) renamePanel(d, `${set.id}/${axis}${k}`, `${set.id}/${axis}${k - 1}`);
  if (axis === 'a') set.across = Math.max(0, set.across - 1);
  else set.along = Math.max(0, set.along - 1);
  set.loose = [...(set.loose ?? []), to];
  return to;
}

/** Bring dividers dragged out of a set back into it, all spaced evenly. */
export function respaceDividers(d: Design, setId: string) {
  const set = d.dividerSets?.[setId];
  if (!set) return;
  const base = d.panels[set.baseId];
  for (const id of set.loose ?? []) {
    const c = parentConnection(d, id);
    if (!c || !base || c.a.panelId !== base.id) continue;
    const axis = c.a.edge === 'e3' ? 'a' : c.a.edge === 'e0' ? 'l' : null;
    if (!axis) continue;
    const n = (axis === 'a' ? set.across : set.along) + 1;
    renamePanel(d, id, `${set.id}/${axis}${n}`);
    const cc = parentConnection(d, `${set.id}/${axis}${n}`);
    if (cc && cc.id !== `${set.id}/c/${axis}${n}` && !d.connections[`${set.id}/c/${axis}${n}`]) {
      delete d.connections[cc.id];
      cc.id = `${set.id}/c/${axis}${n}`;
      d.connections[cc.id] = cc;
    }
    if (axis === 'a') set.across = n;
    else set.along = n;
  }
  set.loose = [];
  set.mode = 'even';
  solve(d);
}

/** A face picked on the stage: the panel, which face (1: its material side, z = t; −1: its plane, z = 0), and the world point clicked. */
export type FacePick = { panelId: string; side: 1 | -1; point: [number, number, number] };
export type BetweenPlan =
  | { ok: true; baseId: string; edge: string; offset: number; height: number }
  | { ok: false; reason: 'notParallel' | 'notFacing' | 'notSameBase' | 'noEdge' | 'tooClose' };

/** Gap between a divider's top and the lower of the two walls it is made between (mm). */
export const DIVIDER_GAP = 5;

/**
 * Can a divider be made between two picked faces? They must be parallel
 * (within 1°), face each other, and belong to panels standing on the same
 * base; the divider stands square to both, from a base edge that runs that
 * way, centred on the second click.
 */
export function planDividerBetween(d: Design, a: FacePick, b: FacePick): BetweenPlan {
  const A = d.panels[a.panelId], B = d.panels[b.panelId];
  if (!A || !B || A.id === B.id) return { ok: false, reason: 'notFacing' };
  const t = d.material.thickness;
  const out = (p: Panel, side: 1 | -1) => {
    const m = matDirOf(p.frame);
    return [m[0] * side, m[1] * side, m[2] * side] as [number, number, number];
  };
  const nA = out(A, a.side), nB = out(B, b.side);
  const dot = nA[0] * nB[0] + nA[1] * nB[1] + nA[2] * nB[2];
  if (Math.abs(dot) < Math.cos(Math.PI / 180)) return { ok: false, reason: 'notParallel' };
  const ab = [b.point[0] - a.point[0], b.point[1] - a.point[1], b.point[2] - a.point[2]];
  if (dot > 0 || ab[0] * nA[0] + ab[1] * nA[1] + ab[2] * nA[2] <= 1e-6) return { ok: false, reason: 'notFacing' };
  const ca = parentConnection(d, A.id), cb = parentConnection(d, B.id);
  if (!ca || !cb || ca.a.panelId !== cb.a.panelId) return { ok: false, reason: 'notSameBase' };
  const base = d.panels[ca.a.panelId];
  // a base edge running along the faces' normal
  const nl = { x: nA[0] * base.frame.u[0] + nA[1] * base.frame.u[1] + nA[2] * base.frame.u[2], y: nA[0] * base.frame.v[0] + nA[1] * base.frame.v[1] + nA[2] * base.frame.v[2] };
  const ll = Math.hypot(nl.x, nl.y);
  if (ll < 0.99) return { ok: false, reason: 'notParallel' };
  const q = (() => {
    const o = base.frame.o;
    const r = [b.point[0] - o[0], b.point[1] - o[1], b.point[2] - o[2]];
    return { x: r[0] * base.frame.u[0] + r[1] * base.frame.u[1] + r[2] * base.frame.u[2], y: r[0] * base.frame.v[0] + r[1] * base.frame.v[1] + r[2] * base.frame.v[2] };
  })();
  let best: { key: string; off: number } | null = null;
  for (const e of panelEdgesOf(base)) {
    const dir = segDir(e);
    if (Math.abs(dir.x * nl.x + dir.y * nl.y) / ll < Math.cos(Math.PI / 180)) continue;
    const inw = { x: -dir.y, y: dir.x };
    const off = (q.x - e.a.x) * inw.x + (q.y - e.a.y) * inw.y - t / 2;
    if (off <= 0) continue;
    if (!best || off < best.off) best = { key: e.key, off };
  }
  if (!best) return { ok: false, reason: 'noEdge' };
  if (best.off < 1) return { ok: false, reason: 'tooClose' };
  // the lower wall's top, above the base's top face
  const top = (p: Panel) => {
    const m = matDirOf(base.frame);
    let hi = -Infinity;
    for (const [x, y] of [[0, 0], [p.w, 0], [p.w, p.h], [0, p.h]]) {
      const w = toWorldOf(p, x, y);
      hi = Math.max(hi, (w[0] - base.frame.o[0]) * m[0] + (w[1] - base.frame.o[1]) * m[1] + (w[2] - base.frame.o[2]) * m[2]);
    }
    return hi;
  };
  const height = Math.round(Math.min(top(A), top(B)) - t - DIVIDER_GAP);
  if (height < MIN_PANEL) return { ok: false, reason: 'tooClose' };
  return { ok: true, baseId: base.id, edge: best.key, offset: Math.round(best.off * 10) / 10, height };
}

/** Make the divider `planDividerBetween` describes; its ends are joined to the two walls. */
export function addDividerBetween(d: Design, a: FacePick, b: FacePick): string | null {
  const plan = planDividerBetween(d, a, b);
  if (!plan.ok) return null;
  const kind: ConnectionKind = d.material.kind === 'plywood' ? 'tabslot' : 'butt';
  const r = growPanel(d, plan.baseId, plan.edge, { height: plan.height, angle: 90, dir: 'up', kind, offset: plan.offset });
  if (!r) return null;
  connectSeams(d, r.panelId);
  return r.panelId;
}

/** Move a divider (a panel grown at an offset) to a new offset from its parent edge. */
export function setDividerOffset(d: Design, panelId: string, offset: number) {
  const c = parentConnection(d, panelId);
  if (!c) return;
  c.offset = Math.max(0.5, offset);
  solve(d);
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
    const pc = parentConnection(d, panelId);
    const tray = pc?.trayId ? d.trays?.[pc.trayId] : undefined;
    // push-pull on a tray wall changes the whole tray, unless the wall has its own height
    if (pc && tray && !p.customHeight) tray.height = Math.max(MIN_PANEL, h) + (wallHeight(d, pc.kind, 100) === 100 ? 0 : d.material.thickness);
    else if (pc) p.h = Math.max(MIN_PANEL, h);
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

/** Normalise an angle to (−180, 180] degrees, rounded to 1e-9. */
export const normDeg = (a: number) => {
  let x = ((a % 360) + 360) % 360;
  if (x > 180) x -= 360;
  return Math.round(x * 1e9) / 1e9;
};

/**
 * Turn shapes by `deg` (counter-clockwise, in their panels' own coordinates)
 * about a pivot on the first shape's panel (default: the centre of the
 * shapes' boxes): each shape's centre moves round the pivot and its `rot`
 * changes by the same angle.
 */
export function rotateDetails(d: Design, ids: string[], deg: number, pivot?: P2) {
  const found = ids.map((id) => findDetail(d, id)).filter((f): f is NonNullable<typeof f> => !!f);
  if (!found.length || !deg) return;
  if (!pivot) {
    const pts = found.flatMap((f) => [{ x: f.detail.cx, y: f.detail.cy }]);
    pivot = { x: (Math.min(...pts.map((q) => q.x)) + Math.max(...pts.map((q) => q.x))) / 2, y: (Math.min(...pts.map((q) => q.y)) + Math.max(...pts.map((q) => q.y))) / 2 };
  }
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  for (const { detail } of found) {
    const x = detail.cx - pivot.x, y = detail.cy - pivot.y;
    if (found.length > 1) {
      detail.cx = pivot.x + x * c - y * s;
      detail.cy = pivot.y + x * s + y * c;
    }
    const r = normDeg((detail.rot ?? 0) + deg);
    if (r) detail.rot = r;
    else delete detail.rot;
  }
}

/** A floor panel's turn about the vertical, in degrees (0 = as drawn): from its frame's u axis. */
export function panelYaw(p: Panel): number {
  return normDeg((Math.atan2(-p.frame.u[2], p.frame.u[0]) * 180) / Math.PI);
}

/**
 * Turn a floor panel (and everything grown on it, which follows through
 * `solve`) about the vertical by `deg`, counter-clockwise seen from above,
 * around a world pivot (default: the panel's centre).
 */
export function rotatePanel(d: Design, panelId: string, deg: number, pivot?: [number, number]) {
  const p = d.panels[panelId];
  if (!p || parentConnection(d, panelId) || !deg) return;
  const f = p.frame;
  const centre = (): [number, number] => [f.o[0] + f.u[0] * (p.w / 2) + f.v[0] * (p.h / 2), f.o[2] + f.u[2] * (p.w / 2) + f.v[2] * (p.h / 2)];
  const [px, pz] = pivot ?? centre();
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  // counter-clockwise from above (y up): x' = x c + z s, z' = −x s + z c
  const turn = (x: number, z: number): [number, number] => [x * c + z * s, -x * s + z * c];
  const clean = (x: number) => (Math.abs(x) < 1e-12 ? 0 : Math.round(x * 1e12) / 1e12);
  const [ox, oz] = turn(f.o[0] - px, f.o[2] - pz);
  const [ux, uz] = turn(f.u[0], f.u[2]);
  const [vx, vz] = turn(f.v[0], f.v[2]);
  p.frame = { ...f, o: [clean(px + ox), f.o[1], clean(pz + oz)], u: [clean(ux), f.u[1], clean(uz)], v: [clean(vx), f.v[1], clean(vz)] };
  solve(d);
}

/** Set a floor panel's turn about the vertical to `deg` (about its centre). */
export function setPanelYaw(d: Design, panelId: string, deg: number) {
  const p = d.panels[panelId];
  if (!p) return;
  rotatePanel(d, panelId, normDeg(deg - panelYaw(p)));
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
  const key = s.edgeIds[i];
  const L0 = Math.hypot(b.x - a.x, b.y - a.y) * t;
  s.pts.splice(i + 1, 0, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  s.edgeIds.splice(i + 1, 0, id);
  // a wall on the edge splits too: the second half gets a copy with the shapes whose centre is on it
  for (const c of Object.values(d.connections)) {
    if (!c.grown || c.a.panelId !== panelId || c.a.edge !== key) continue;
    const wall = d.panels[c.b.panelId];
    if (!wall) continue;
    const nid = newId('p'), cid = newId('c');
    const moved = wall.details.filter((dt) => dt.cx > L0);
    wall.details = wall.details.filter((dt) => dt.cx <= L0);
    d.panels[nid] = { ...plain({ ...wall, details: [] }), id: nid, name: `${d.order.length + 1}`, details: moved.map((dt) => ({ ...dt, cx: dt.cx - L0 })) };
    d.order.push(nid);
    d.pieces[nid] = { quantity: d.pieces[wall.id]?.quantity ?? 1 };
    d.connections[cid] = { ...plain({ ...c, geom: undefined }), id: cid, a: { panelId, edge: id }, b: { panelId: nid, edge: 'e0' } };
  }
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
  const n = s.pts.length;
  const keep = s.edgeIds[(i + n - 1) % n], gone = s.edgeIds[i];
  const start = s.pts[(i + n - 1) % n], end = s.pts[(i + 1) % n];
  s.pts = pts;
  s.edgeIds.splice(i, 1);
  // walls on the two edges merge into one on the merged edge, keeping both walls' shapes
  const on = (k: string) => Object.values(d.connections).find((c) => c.grown && c.a.panelId === panelId && c.a.edge === k && !(c.offset > 0 && !c.trayId && c.kind !== 'tabslot'));
  const cKeep = on(keep), cGone = on(gone);
  if (cGone && !cKeep) cGone.a.edge = keep;
  else if (cGone && cKeep) {
    const W1 = d.panels[cKeep.b.panelId], W2 = d.panels[cGone.b.panelId];
    if (W1 && W2) {
      // shapes keep their place in space, measured along the merged edge
      const ws = worldAt(p, start.x, start.y), we = worldAt(p, end.x, end.y);
      const len = Math.hypot(we[0] - ws[0], we[1] - ws[1], we[2] - ws[2]);
      const u = [(we[0] - ws[0]) / len, (we[1] - ws[1]) / len, (we[2] - ws[2]) / len];
      for (const dt of W2.details) {
        const w = worldAt(W2, dt.cx, dt.cy);
        W1.details.push({ ...dt, cx: (w[0] - ws[0]) * u[0] + (w[1] - ws[1]) * u[1] + (w[2] - ws[2]) * u[2] });
      }
      for (const c of Object.values(d.connections)) if (c.grown && c.a.panelId === W2.id) c.a.panelId = W1.id;
      deletePanel(d, W2.id);
    }
  }
  normalizeSketch(p);
  solve(d);
  return true;
}

/** A grown wall's sketch, if the panel is one. */
function wallSketch(d: Design, wallId: string): WallSketch | null {
  const p = d.panels[wallId];
  return p && p.sketch.kind === 'wall' && parentConnection(d, wallId) ? p.sketch : null;
}

/**
 * Move a free corner of a wall (offsets from its rectangle corner). The
 * bottom corners slide only along the attached edge (dy stays 0).
 */
export function setWallCorner(d: Design, wallId: string, corner: WallCorner, off: { dx: number; dy: number }) {
  const s = wallSketch(d, wallId);
  if (!s) return;
  const bottom = corner === 'bl' || corner === 'br';
  const v = { dx: Math.round(off.dx * 100) / 100, dy: bottom ? 0 : Math.round(off.dy * 100) / 100 };
  s.corners = { ...(s.corners ?? {}), [corner]: v };
  if (!v.dx && !v.dy) delete s.corners[corner];
  if (!Object.keys(s.corners).length) delete s.corners;
  solve(d);
}

/** Insert a point on a free edge of a wall at fraction t along it, pushed `off` mm outward (a gable: e2, 0.5, 30). */
export function addWallInsert(d: Design, wallId: string, edge: WallInsert['edge'], t: number, off = 0): string | null {
  const s = wallSketch(d, wallId);
  if (!s) return null;
  const id = newId('i');
  s.inserts = [...(s.inserts ?? []), { id, edge, t: Math.max(0.01, Math.min(0.99, t)), off }];
  solve(d);
  return id;
}

export function moveWallInsert(d: Design, wallId: string, insertId: string, patch: Partial<Pick<WallInsert, 't' | 'off'>>) {
  const s = wallSketch(d, wallId);
  const ins = s?.inserts?.find((x) => x.id === insertId);
  if (!ins) return;
  if (patch.t !== undefined) ins.t = Math.max(0.01, Math.min(0.99, patch.t));
  if (patch.off !== undefined) ins.off = Math.round(patch.off * 100) / 100;
  solve(d);
}

export function deleteWallInsert(d: Design, wallId: string, insertId: string) {
  const s = wallSketch(d, wallId);
  if (!s?.inserts) return;
  s.inserts = s.inserts.filter((x) => x.id !== insertId);
  if (!s.inserts.length) delete s.inserts;
  solve(d);
}

/** Can this wall edge take a fold-over: card or corrugated, a grown wall, a free edge? */
export function canFoldOver(d: Design, wallId: string, edge: string): boolean {
  const p = d.panels[wallId];
  if (!p || d.material.kind === 'plywood' || !parentConnection(d, wallId) || !findEdge(p, edge)) return false;
  if (edge === 'e0' || edgeConnection(d, wallId, edge)) return false;
  return !(p.foldOvers ?? []).some((f) => f.edge === edge);
}

/** Add a fold-over on a wall's free edge (default: its top). Lock tabs on corrugated, glue on card. */
export function addFoldOver(d: Design, wallId: string, edge = 'e2'): string | null {
  if (!canFoldOver(d, wallId, edge)) return null;
  const p = d.panels[wallId];
  const id = newId('f');
  p.foldOvers = [...(p.foldOvers ?? []), { id, edge, depth: null, lock: d.material.kind === 'corrugated' ? 'tabs' : 'glue', locks: null, lockDepth: null }];
  solve(d);
  return id;
}

export function updateFoldOver(d: Design, wallId: string, id: string, patch: Partial<Omit<FoldOver, 'id' | 'edge'>>) {
  const f = d.panels[wallId]?.foldOvers?.find((x) => x.id === id);
  if (!f) return;
  Object.assign(f, patch);
  if (f.depth !== null) f.depth = Math.max(5, f.depth);
  if (f.locks !== null) f.locks = Math.max(1, Math.min(4, Math.round(f.locks)));
  if (f.lockDepth !== null) f.lockDepth = Math.max(2, f.lockDepth);
  solve(d);
}

export function removeFoldOver(d: Design, wallId: string, id: string) {
  const p = d.panels[wallId];
  if (!p?.foldOvers) return;
  p.foldOvers = p.foldOvers.filter((x) => x.id !== id);
  if (!p.foldOvers.length) delete p.foldOvers;
  solve(d);
}

export function deletePanel(d: Design, panelId: string) {
  // deleting a tray wall opens that side of the tray
  const tc = Object.values(d.connections).find((c) => c.grown && c.b.panelId === panelId && c.trayId);
  const tray = tc && d.trays?.[tc.trayId!];
  if (tc && tray) {
    const base = d.panels[tc.a.panelId];
    const key = (base && findEdge(base, tc.a.edge)?.key) ?? tc.a.edge;
    tray.openEdges = [...new Set([...tray.openEdges, key])];
  }
  for (const t of Object.values(d.trays ?? {})) if (t.baseId === panelId) delete d.trays[t.id];
  for (const c of Object.values(d.connections)) {
    if (c.a.panelId === panelId || c.b.panelId === panelId) delete d.connections[c.id];
  }
  delete d.panels[panelId];
  delete d.pieces[panelId];
  d.order = d.order.filter((id) => id !== panelId);
  for (const k of Object.keys(d.placements)) if (k.startsWith(panelId + '#')) delete d.placements[k];
  solve(d);
}

export function addDetail(d: Design, panelId: string, shape: DetailShape, op: DetailOp, cx: number, cy: number, w: number, h: number, fixedId?: string, through = false): string | null {
  const p = d.panels[panelId];
  if (!p) return null;
  const id = fixedId ?? newId('x');
  const dt: Detail = { id, shape, op, cx, cy, w: Math.max(0.5, w), h: Math.max(0.5, shape === 'circle' ? w : h) };
  if (shape === 'roundrect') dt.r = Math.min(dt.w, dt.h) / 4;
  if (through && op === 'cut') dt.through = true;
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
export function addPolygonShape(d: Design, panelId: string, pts: P2[], op: DetailOp, regular?: number, fixedId?: string, through = false): string | null {
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
  if (through && op === 'cut') dt.through = true;
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

export function updateDetail(d: Design, detailId: string, patch: Partial<Pick<Detail, 'cx' | 'cy' | 'w' | 'h' | 'r' | 'op' | 'through' | 'rot'>>) {
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
  // only a Cut goes through
  if (dt.op !== 'cut' || !dt.through) delete dt.through;
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

export type ConnPatch = Partial<Pick<Connection, 'kind' | 'fingers' | 'tabs' | 'flap' | 'foldDir' | 'angle' | 'offset' | 'dir' | 'tabLen' | 'lockDepth'>>;

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
  if (patch.tabLen) {
    if (patch.tabLen === 'through') c.tabLen = 'through';
    else delete c.tabLen;
    c.auto = false;
  }
  if (patch.lockDepth !== undefined) c.lockDepth = patch.lockDepth === null ? null : Math.max(2, patch.lockDepth);
  if (patch.dir && c.grown) c.dir = patch.dir;
  if (patch.offset !== undefined && c.grown) c.offset = Math.max(0, patch.offset);
  solve(d);
  if (c.grown && c.kind === 'lean') connectSeams(d, c.b.panelId);
}

/** A grown connection standing well inside its parent (a divider), not at the edge. */
function isDividerOffset(d: Design, c: Connection) {
  return c.offset > 2 * d.material.thickness + minWeb(d.material);
}
