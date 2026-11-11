// Pure model operations. Each takes a Design (an immer draft when called
// from the store) and mutates it. `solve` re-derives everything that is
// owned by connections, so every operation ends with a consistent design.
import { pieceRoot, placementPiece } from './keys';
// shapes feed the edge layer: make sure the own-outline hook is installed
import './outline';
import type { Connection, ConnectionKind, Design, Detail, DetailShape, DetailOp, FoldOver, MaterialProfile, P2, Panel, PanelPlace, Tray, WallCorner, WallInsert, WallSketch } from './types';
import { insideCornerExtensions, reconcileTrays, trayOf, trayWalls, wallHeight } from './trays';
import { edgeFreeSpans, spanFrame, spanOf } from './adapt';
import { pointInPolygon, polygonArea, segDistPoint } from '../geom/vec';
import { panelNotches, panelOutline } from './geometry';
import { SCHEMA_VERSION } from './types';
import { DEFAULT_MATERIAL, connectionsFor, matOf, minWeb, normalizeMaterials, tOf } from './materials';
import { allowedKinds, designKind, dividerKind, FACE_ORDER, groupConnections, jointGroup, jointsOf, newTrayKinds, normalizeJoints, ownerMaterial, pairKinds, patchJoints, type JointGroup } from './jointDefaults';
import { edgeLength, growFrame, GROUND_FRAME, matDir as matDirOf, toWorld as toWorldOfFrame, type GrowDir, type Seating } from './frame';
import { panelEdges as panelEdgesOf } from './edges';
import { applyTrims, fixFlatNets, fixKind, flatInfo } from './flatnet';
import { constructionSet, dropToFloor, FLOOR_FRAME, flatOnHost, hostedOn, netRoot, placeCycle, placeFrame } from './place';
const toWorldOf = (p: Panel, x: number, y: number) => toWorldOfFrame(p.frame, x, y);
import { baseKey, connectionGeom, findOpenSeams, minContact, seamContact, seamKey, seamKinds, seamStillFits, seamTypeOf, type OpenSeam } from './seams';
import { edgeNeighbours, edgePieces, ek, findEdge, isRectSketch, rectEdgeIndex, rectSketch, segDir, segLength, sketchOf, sketchRing, straightRing, isCurveKey, type EdgeArg } from './edges';

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
export function fitKind(c: Connection, allowed: ConnectionKind[], fallback?: ConnectionKind) {
  c.pref ??= c.kind;
  c.kind = allowed.includes(c.pref) ? c.pref : fallback && allowed.includes(fallback) ? fallback : allowed[0];
}

/**
 * Re-derive everything connections own: child frames and widths (parents
 * first), then every connection's joint geometry. A connection whose panels
 * no longer meet keeps its last valid geometry and is flagged `broken`.
 */
export function solve(d: Design) {
  solveOnce(d);
  // tray nets that would overlap when flat are changed so they lie flat (milestone 35)
  fixFlatNets(d, solveOnce);
}

function solveOnce(d: Design) {
  normalizeJoints(d);
  normalizeMaterials(d);
  d.trays ??= {};
  for (const id of d.order) {
    const p = d.panels[id];
    if (!p) continue;
    p.sketch ??= parentConnection(d, id) ? { kind: 'wall' } : rectSketch(p.w, p.h);
    // a polygon sketch decides the bounding size
    if (p.sketch.kind === 'poly' && !isRectSketch(p)) {
      // the outline as drawn: a curve can bulge past its points
      const pts = p.sketch.pts.some((q) => q.curve) ? sketchRing(p).map((e) => e.a) : p.sketch.pts;
      p.w = Math.max(...pts.map((q) => q.x));
      p.h = Math.max(...pts.map((q) => q.y));
    }
  }
  reconcileWallSets(d);
  reconcileTrays(d, makeTrayWall);
  insideCornerExtensions(
    d,
    (baseId, key) => {
      const base = d.panels[baseId];
      const c = Object.values(d.connections).find((x) => x.grown && x.a.panelId === baseId && x.offset === 0 && Math.abs(x.angle - 90) < 1e-6 && (x.a.edge === key || (base && findEdge(base, x.a.edge)?.key === key)));
      return c?.b.panelId;
    },
    (a, b) => Object.values(d.connections).find((x) => !x.grown && ((x.a.panelId === a && x.b.panelId === b) || (x.a.panelId === b && x.b.panelId === a)))?.kind,
  );
  // placed panels (milestone 28) follow their host: hosts first, in the same pass as grown panels (a host may be grown)
  const placed = d.order.filter((id) => d.panels[id]?.place && !parentConnection(d, id));
  const derive = (id: string) => {
    const p = d.panels[id];
    const f = p?.place && placeFrame(d, p.place);
    if (f) p.frame = f;
  };
  const done = new Set<string>(d.order.filter((id) => !parentConnection(d, id) && !(d.panels[id]?.place && d.panels[id].place!.host !== null)));
  for (const id of placed) if (d.panels[id].place!.host === null) derive(id);
  const waiting = placed.filter((id) => d.panels[id].place!.host !== null);
  const pending = Object.values(d.connections).filter((c) => c.grown);
  let progress = true;
  while ((pending.length || waiting.length) && progress) {
    progress = false;
    for (let i = 0; i < waiting.length; i++) {
      const id = waiting[i], host = d.panels[id].place!.host!;
      if (d.panels[host] && !done.has(host)) continue;
      waiting.splice(i--, 1);
      progress = true;
      derive(id);
      done.add(id);
    }
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
      const ok = pairKinds(d, c);
      fitKind(c, ok, designKind(d, 'base', ok, matOf(d, child.id).kind));
      // a tray wall changed so its net lies flat; a tray wall stands in by its joint's own offset
      if (c.trayId) {
        fixKind(d, c);
        c.offset = defaultOffset(d, c.kind, parent.id);
      }
      // part of the edge (a partial width), except for tray walls
      const span = c.trayId ? null : c.span;
      child.frame = spanFrame(parent, c.a.edge, c.angle, c.dir, tOf(d, parent.id), seatingOf(c.kind), c.offset, span, tOf(d, child.id));
      const [s0, s1] = spanOf(parent, c.a.edge, span);
      child.w = s1 - s0;
      child.h = Math.max(child.h, MIN_PANEL);
      done.add(child.id);
    }
  }
  const guides = constructionSet(d);
  for (const c of Object.values(d.connections)) {
    // construction panels are never joined: their connections carry no joint
    if (guides.has(c.a.panelId) || guides.has(c.b.panelId)) {
      delete c.geom;
      c.broken = false;
      delete c.thin;
      continue;
    }
    if (!c.grown) {
      const ok = pairKinds(d, c);
      const g = jointGroup(c);
      fitKind(c, ok, g ? designKind(d, g, ok, ownerMaterial(d, c).kind) : undefined);
      // a tray corner made a fold so a wall lies flat beside its neighbour
      if (c.trayId || c.hingeOf) fixKind(d, c);
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
  applyTrims(d);
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
      // (a wall on part of an edge keeps its part on the first piece; the walls on the other pieces take their whole piece)
      if (!d.connections[cid]) d.connections[cid] = { ...plain({ ...c, geom: undefined, span: undefined }), id: cid, a: { panelId: parent.id, edge: `${c.a.edge}#${n}` }, b: { panelId: id, edge: 'e0' } };
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
    d.panels[id] = { id, name: `${d.order.length + 1}`, w: edgeLength(base, edge), h: Math.max(MIN_PANEL, wallHeight(d, kind, tray.height, base.id)), sketch: { kind: 'wall' }, frame: base.frame, details: [], ...(base.material ? { material: base.material } : {}) };
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
      offset: defaultOffset(d, kind, base.id),
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
export function addTray(d: Design, baseId: string, height: number, kinds?: Partial<Pick<Tray, 'wallKind' | 'cornerKind' | 'flat' | 'pin' | 'openEdges' | 'tabLen'>>): string | null {
  const base = d.panels[baseId];
  if (!base || parentConnection(d, baseId) || Object.values(d.trays ?? {}).some((t) => t.baseId === baseId)) return null;
  const id = newId('tr');
  d.trays ??= {};
  d.trays[id] = { id, baseId, height: Math.max(MIN_PANEL + tOf(d, baseId), height), ...newTrayKinds(d, baseId), openEdges: [], ...kinds };
  solve(d);
  for (const w of trayWalls(d, id)) connectSeams(d, w);
  return id;
}

/** Change a tray's shared outer height (walls with their own height keep it). */
export function setTrayHeight(d: Design, trayId: string, height: number) {
  const tray = d.trays?.[trayId];
  if (!tray) return;
  tray.height = Math.max(MIN_PANEL + tOf(d, tray.baseId), height);
  solve(d);
}

/** Change a tray's wall-to-base or corner joint (or its tab length) for all its walls and corners. */
export function setTrayKinds(d: Design, trayId: string, patch: Partial<Pick<Tray, 'wallKind' | 'cornerKind' | 'tabLen'>>) {
  const tray = d.trays?.[trayId];
  if (!tray) return;
  Object.assign(tray, patch);
  if (patch.tabLen) for (const c of Object.values(d.connections)) if (c.trayId === trayId && !c.grown) {
    if (patch.tabLen !== 'flush') c.tabLen = patch.tabLen;
    else delete c.tabLen;
  }
  for (const c of Object.values(d.connections)) {
    if (c.trayId !== trayId) continue;
    if (c.grown && patch.wallKind) {
      c.kind = c.pref = patch.wallKind;
      c.offset = defaultOffset(d, patch.wallKind, c.a.panelId);
    } else if (!c.grown && patch.cornerKind && pairKinds(d, c).includes(patch.cornerKind)) c.kind = c.pref = patch.cornerKind;
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
export type GrowOpts = {
  height: number;
  angle: number;
  dir: GrowDir;
  kind: ConnectionKind;
  offset?: number;
  pref?: ConnectionKind;
  /** Part of the parent edge to stand on ([s0, s1] mm from its start); absent: the whole edge. */
  span?: [number, number] | null;
  /** The new panel's outline (wall corners and inserts), e.g. trimmed to its neighbours. */
  sketch?: WallSketch | null;
};

/** Default distance from the edge for a tab-and-slot wall: leaves a safe web outside its slots. */
export function defaultOffset(d: Design, kind: ConnectionKind, parentId?: string): number {
  // the parent's material: the web is left in it, outside its slots
  const m = parentId ? matOf(d, parentId) : d.material;
  // the slots grow by half the clearance: the web outside them stays at least the material's minimum
  return kind === 'tabslot' ? Math.max(minWeb(m) + m.clearance / 2, m.thickness) : 0;
}

export function growPanel(d: Design, parentId: string, edgeArg: EdgeArg, opts: GrowOpts): { panelId: string; connectionId: string } | null {
  const parent = d.panels[parentId];
  const edge = ek(edgeArg);
  if (!parent || !findEdge(parent, edge) || isCurveKey(edge)) return null;
  const offset = opts.offset ?? defaultOffset(d, opts.kind, parentId);
  const L = edgeLength(parent, edge);
  const partial = opts.span && spanOf(parent, edge, opts.span)[1] - spanOf(parent, edge, opts.span)[0] < L - 1e-6 ? spanOf(parent, edge, opts.span) : null;
  if (offset === 0) {
    // the edge (or the part asked for) must be free
    const want = partial ?? [0, L];
    const free = edgeFreeSpans(d, parentId, edge);
    if (!free.some(([a, b]) => a <= want[0] + 1e-6 && b >= want[1] - 1e-6)) return null;
  }
  const id = newId('p');
  d.panels[id] = {
    id,
    name: `${d.order.length + 1}`,
    w: partial ? partial[1] - partial[0] : L,
    h: Math.max(MIN_PANEL, opts.height),
    sketch: { kind: 'wall', ...(opts.sketch ? plain({ corners: opts.sketch.corners, inserts: opts.sketch.inserts }) : {}) },
    frame: spanFrame(parent, edge, opts.angle, opts.dir, tOf(d, parentId), seatingOf(opts.kind), offset, partial),
    details: [],
    // a grown board takes its parent's material
    ...(parent.material ? { material: parent.material } : {}),
  };
  const ws = d.panels[id].sketch as WallSketch;
  if (!ws.corners) delete ws.corners;
  if (!ws.inserts) delete ws.inserts;
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
    ...(partial ? { span: [partial[0], partial[1]] as [number, number] } : {}),
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
  const asked = kind;
  const nets = netState(d);
  const kinds = seamKinds(matOf(d, seam.a.panelId), seam.type, matOf(d, seam.b.panelId));
  // tray corners use the tray's corner joint
  const ta = trayOf(d, seam.a.panelId), tb = trayOf(d, seam.b.panelId);
  const tray = ta && tb && ta.id === tb.id && ta.baseId !== seam.a.panelId && ta.baseId !== seam.b.panelId ? ta : undefined;
  if (!kind && tray && seam.type === 'corner') kind = tray.cornerKind;
  // otherwise the design's choice for corners or for edges on a face
  if (!kind && seam.type !== 'cross') kind = designKind(d, seam.type === 'corner' ? 'corner' : 'base', kinds, matOf(d, seam.a.panelId).kind);
  const k = kind && kinds.includes(kind) ? kind : kinds[0];
  const cid = newId('c');
  // fingers: `a` must be the earlier panel, which owns the corners
  // a seam is kept on whole edges: its joint lays out over every piece of an edge a cut split
  let a = { ...seam.a, edge: baseKey(seam.a.edge) }, b = { ...seam.b, edge: baseKey(seam.b.edge) };
  if (seam.type === 'corner' && d.order.indexOf(a.panelId) > d.order.indexOf(b.panelId)) [a, b] = [b, a];
  d.connections[cid] = { id: cid, kind: k, pref: k, a, b, grown: false, angle: 90, dir: 'up', offset: 0, fingers: null, tabs: null, flap: null, foldDir: 'valley', auto, ...(tray ? { trayId: tray.id } : {}), ...(tray?.tabLen && tray.tabLen !== 'flush' ? { tabLen: tray.tabLen } : {}) };
  if (!auto && d.noAutoSeams) d.noAutoSeams = d.noAutoSeams.filter((x) => x !== pairKey(a.panelId, b.panelId));
  solve(d);
  // an edge on a face: tabs and slots if they can be made there, else a glue flap, else a slide fit
  if (!asked && seam.type === 'face') fallBack(d, cid, kinds, nets);
  return cid;
}

/**
 * Can a connection's joint be made as it is: laid out at all, and, for tabs
 * and slots, every slot inside its panel with the material's web around it?
 */
export function jointWorks(d: Design, c: Connection): boolean {
  if (c.broken || !c.geom) return false;
  if (c.kind !== 'tabslot') return true;
  for (const h of c.geom.holes) {
    const p = d.panels[h.panelId];
    if (!p) continue;
    const outline = panelOutline(p, panelNotches(d, p));
    const min = minWeb(matOf(d, p.id));
    if (!h.poly.every((q) => pointInPolygon(q, outline))) return false;
    for (let i = 0; i < h.poly.length; i++)
      for (let j = 0; j < outline.length; j++) if (segDistPoint(h.poly[i], outline[j], outline[(j + 1) % outline.length]) < min - 1e-6) return false;
  }
  return true;
}

/** How the trays' nets lie flat (their fixes): a joint that changes this would not fit in its net. */
const netState = (d: Design) => JSON.stringify(Object.values(d.trays ?? {}).map((t) => [t.id, t.fixes ?? null]));

/**
 * Try the next kind in FACE_ORDER (among `allowed`) while the joint cannot be
 * made, or while it makes a tray's net need changing to lie flat (`nets`: the
 * nets before it was added).
 */
export function fallBack(d: Design, cid: string, allowed: ConnectionKind[], nets?: string) {
  const c = d.connections[cid];
  if (!c) return;
  const chain = FACE_ORDER.filter((k) => allowed.includes(k));
  let i = chain.indexOf(c.kind);
  if (i < 0) return;
  const fits = () => jointWorks(d, d.connections[cid]) && (nets === undefined || netState(d) === nets);
  while (!fits() && ++i < chain.length) {
    d.connections[cid].kind = chain[i];
    d.connections[cid].pref = chain[i];
    solve(d);
  }
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
  const kind = dividerKind(d, baseId);
  const nets = netState(d);
  const r = growPanel(d, baseId, edge, { height, angle: 90, dir: 'up', kind, offset: Math.max(0.5, position) });
  if (!r) return null;
  dividerFallBack(d, r.panelId, nets);
  connectSeams(d, r.panelId);
  return r.panelId;
}

/** A divider's joint with its base: the next kind along FACE_ORDER while it cannot be made. */
function dividerFallBack(d: Design, panelId: string, nets?: string) {
  const c = parentConnection(d, panelId);
  if (!c) return;
  const m = matOf(d, c.a.panelId);
  fallBack(d, c.id, connectionsFor(m, 90).filter((k) => seamKinds(m, 'face').includes(k)), nets);
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
  const t = tOf(d, parentConnection(d, A.id)?.a.panelId ?? A.id);
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

/**
 * The divider between two selected walls (milestone 32): each wall's face
 * towards the other, at the middle of the stretch where the two overlap along
 * their length (a divider counts as a wall).
 */
export function wallPicks(d: Design, aId: string, bId: string): [FacePick, FacePick] | null {
  const A = d.panels[aId], B = d.panels[bId];
  if (!A || !B || aId === bId) return null;
  const centre = (p: Panel) => toWorldOfFrame(p.frame, p.w / 2, p.h / 2);
  const ca = centre(A), cb = centre(B);
  const toward = (p: Panel, other: [number, number, number]): 1 | -1 => {
    const m = matDirOf(p.frame), o = p.frame.o;
    return (other[0] - o[0]) * m[0] + (other[1] - o[1]) * m[1] + (other[2] - o[2]) * m[2] >= tOf(d, p.id) / 2 ? 1 : -1;
  };
  // along the walls' length (A's u): where both reach
  const u = A.frame.u;
  const along = (p: Panel) => {
    const xs = [toWorldOfFrame(p.frame, 0, 0), toWorldOfFrame(p.frame, p.w, 0)].map((w) => w[0] * u[0] + w[1] * u[1] + w[2] * u[2]);
    return [Math.min(...xs), Math.max(...xs)];
  };
  const [a0, a1] = along(A), [b0, b1] = along(B);
  const lo = Math.max(a0, b0), hi = Math.min(a1, b1);
  const mid = hi > lo ? (lo + hi) / 2 : (a0 + a1 + b0 + b1) / 4;
  const at = (p: Panel, side: 1 | -1, c: [number, number, number]): [number, number, number] => {
    const s0 = c[0] * u[0] + c[1] * u[1] + c[2] * u[2];
    const m = matDirOf(p.frame), z = side === 1 ? tOf(d, p.id) : 0;
    const base = [c[0] + u[0] * (mid - s0), c[1] + u[1] * (mid - s0), c[2] + u[2] * (mid - s0)];
    // onto the face: the material side or the plane, through the centre
    const o = p.frame.o;
    const depth = (base[0] - o[0]) * m[0] + (base[1] - o[1]) * m[1] + (base[2] - o[2]) * m[2];
    return [base[0] + m[0] * (z - depth), base[1] + m[1] * (z - depth), base[2] + m[2] * (z - depth)];
  };
  const sa = toward(A, cb), sb = toward(B, ca);
  return [
    { panelId: aId, side: sa, point: at(A, sa, ca) },
    { panelId: bId, side: sb, point: at(B, sb, cb) },
  ];
}

/** Can a divider go between these two walls, and where (or why not)? */
export function planDividerFor(d: Design, aId: string, bId: string): BetweenPlan {
  const picks = wallPicks(d, aId, bId);
  return picks ? planDividerBetween(d, picks[0], picks[1]) : { ok: false, reason: 'notFacing' };
}

/** + Divider: halfway between two facing walls on one base; its ends are joined to both. */
export function addDividerFor(d: Design, aId: string, bId: string): string | null {
  const picks = wallPicks(d, aId, bId);
  return picks ? addDividerBetween(d, picks[0], picks[1]) : null;
}

/** Make the divider `planDividerBetween` describes; its ends are joined to the two walls. */
export function addDividerBetween(d: Design, a: FacePick, b: FacePick): string | null {
  const plan = planDividerBetween(d, a, b);
  if (!plan.ok) return null;
  const kind = dividerKind(d, plan.baseId);
  const nets = netState(d);
  const r = growPanel(d, plan.baseId, plan.edge, { height: plan.height, angle: 90, dir: 'up', kind, offset: plan.offset });
  if (!r) return null;
  dividerFallBack(d, r.panelId, nets);
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
  const base = d.panels[baseId];
  const nb = base && edgeNeighbours(base, edge);
  if (!nb) return [];
  const m = matOf(d, baseId), t = m.thickness;
  const h = Math.ceil(t + leanHeight * Math.sin((angle * Math.PI) / 180) + 5);
  const kind = designKind(d, 'base', connectionsFor(m, 90), m.kind) ?? (m.kind === 'plywood' ? 'finger' : 'fold');
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
    if (pc && tray && !p.customHeight) tray.height = Math.max(MIN_PANEL, h) + (pc.kind === 'finger' ? 0 : tOf(d, pc.a.panelId));
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
export function setEdgeLength(d: Design, panelId: string, key: string, length: number): boolean {
  const p = d.panels[panelId];
  const e = p && findEdge(p, key);
  if (!p || !e || p.sketch.kind !== 'poly' || parentConnection(d, panelId)) return false;
  const i = p.sketch.edgeIds.indexOf(key);
  if (i < 0) return false;
  const dir = segDir(e);
  const L = Math.max(MIN_PANEL, length);
  const n = p.sketch.pts.length;
  const was = p.sketch.pts[(i + 1) % n];
  p.sketch.pts[(i + 1) % n] = { ...was, x: e.a.x + dir.x * L, y: e.a.y + dir.y * L };
  // an outline that would cross itself is refused, as moveVertex does (BUGFIX_PLAN B10)
  if (!isSimplePolygon(sketchRing(p).map((x) => x.a))) {
    p.sketch.pts[(i + 1) % n] = was;
    return false;
  }
  normalizeSketch(p);
  return true;
}

/** Keep a root polygon's bounding box at the local origin (moving the frame to match) and its edges CCW. */
export function normalizeSketch(p: Panel) {
  const s = p.sketch;
  if (s.kind !== 'poly') return;
  // the outline as drawn: a curve can bulge past its points
  const ring = s.pts.some((q) => q.curve) ? sketchRing(p).map((e) => e.a) : s.pts;
  const minX = Math.min(...ring.map((q) => q.x)), minY = Math.min(...ring.map((q) => q.y));
  if (Math.abs(minX) > 1e-9 || Math.abs(minY) > 1e-9) {
    s.pts = s.pts.map((q) => ({ ...q, x: q.x - minX, y: q.y - minY }));
    const f = p.frame;
    p.frame = { ...f, o: [f.o[0] + f.u[0] * minX + f.v[0] * minY, f.o[1] + f.u[1] * minX + f.v[1] * minY, f.o[2] + f.u[2] * minX + f.v[2] * minY] };
    // a placed panel's origin is its place on the host: moved the same way (a standing one only along its line)
    const pl = p.place;
    if (pl) {
      const a = (pl.rot * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
      const my = pl.pose === 'flat' ? minY : 0;
      pl.x += c * minX - sn * my;
      pl.y += sn * minX + c * my;
    }
    for (const dt of p.details) {
      dt.cx -= minX;
      dt.cy -= minY;
    }
  }
  const after = s.pts.some((q) => q.curve) ? sketchRing(p).map((e) => e.a) : s.pts;
  p.w = Math.max(...after.map((q) => q.x));
  p.h = Math.max(...after.map((q) => q.y));
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
  // a placed panel: its turn on its host
  if (p.place) return normDeg(p.place.rot);
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
  if (p.place) {
    // in its host's plane: about a floor pivot (world x, z) on the floor, else about its centre
    const pl = p.place;
    const piv = pivot && pl.host === null ? { x: pivot[0], y: -pivot[1] } : placedCentre(p);
    rotatePlaced(d, panelId, deg, piv);
    return;
  }
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
  if (p.place) {
    // a world move on the floor, carried into the host's plane
    const H = p.place.host === null ? FLOOR_FRAME : d.panels[p.place.host]?.frame;
    if (!H) return;
    movePlaced(d, panelId, dx * H.u[0] + dz * H.u[2], dx * H.v[0] + dz * H.v[2]);
    return;
  }
  p.frame.o = [p.frame.o[0] + dx, p.frame.o[1], p.frame.o[2] + dz];
  solve(d);
}

/** Move a placed panel in its host's plane (host-local mm). */
export function movePlaced(d: Design, panelId: string, dx: number, dy: number) {
  const pl = d.panels[panelId]?.place;
  if (!pl) return;
  pl.x += dx;
  pl.y += dy;
  solve(d);
}

/** A placed panel's centre in its host's coordinates (a standing one: the middle of its bottom line). */
export function placedCentre(p: Panel): P2 {
  const pl = p.place!;
  const a = (pl.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const hx = p.w / 2, hy = pl.pose === 'flat' ? p.h / 2 : 0;
  return { x: pl.x + c * hx - s * hy, y: pl.y + s * hx + c * hy };
}

/** Turn a placed panel about its host's normal by `deg` (counter-clockwise in host coordinates) about `pivot` (host-local; default its centre). */
export function rotatePlaced(d: Design, panelId: string, deg: number, pivot?: P2) {
  const p = d.panels[panelId];
  const pl = p?.place;
  if (!p || !pl || !deg) return;
  const piv = pivot ?? placedCentre(p);
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const x = pl.x - piv.x, y = pl.y - piv.y;
  const clean = (v: number) => Math.round(v * 1e9) / 1e9;
  pl.x = clean(piv.x + x * c - y * s);
  pl.y = clean(piv.y + x * s + y * c);
  pl.rot = normDeg(pl.rot + deg);
  solve(d);
}

/**
 * A panel placed on the floor or a face of another panel (milestone 28): flat
 * (a w × h rectangle from its origin) or standing on a line (w long, h tall).
 * It is a net of its own in the working material. A standing panel is joined
 * to its host's face like any edge on a face; a flat one is not joined.
 */
export function addPlacedPanel(d: Design, place: PanelPlace, w: number, h: number, opts: { construction?: boolean } = {}): string | null {
  if (place.host !== null && !d.panels[place.host]) return null;
  const id = newId('p');
  const pw = Math.max(MIN_PANEL, w), ph = Math.max(MIN_PANEL, h);
  const frame = placeFrame(d, place);
  if (!frame) return null;
  d.panels[id] = { id, name: `${d.order.length + 1}`, w: pw, h: ph, sketch: rectSketch(pw, ph), frame, details: [], place: { ...place }, ...(opts.construction ? { construction: true as const } : {}) };
  d.order.push(id);
  d.pieces[id] = { quantity: 1 };
  solve(d);
  if (!opts.construction) connectSeams(d, id);
  return id;
}

/** Put a placed panel on another host (null: the floor), keeping its place there; refused when it would rest on itself. */
export function rehost(d: Design, panelId: string, place: PanelPlace): boolean {
  const p = d.panels[panelId];
  if (!p || parentConnection(d, panelId) || placeCycle(d, panelId, place.host)) return false;
  p.place = { ...place };
  solve(d);
  return true;
}

/**
 * Make a panel's whole net a construction guide, or real again (milestone 28).
 * As a guide its joints go (its own grown ones stay, carrying no joint); made
 * real, it is joined like any panel.
 */
export function setConstruction(d: Design, panelId: string, on: boolean) {
  const root = netRoot(d, panelId);
  const r = d.panels[root];
  if (!r) return;
  if (on) {
    r.construction = true;
    const net = constructionSet(d);
    for (const c of Object.values(d.connections)) if (!c.grown && (net.has(c.a.panelId) || net.has(c.b.panelId))) delete d.connections[c.id];
    solve(d);
    return;
  }
  const net = [...constructionSet(d)].filter((id) => netRoot(d, id) === root);
  delete r.construction;
  solve(d);
  for (const id of net) if (d.panels[id]) connectSeams(d, id);
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
  const pts = p.sketch.pts.map((q, k) => (k === i ? { ...q, x: to.x, y: to.y } : q));
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
export function setWallCorner(d: Design, wallId: string, corner: WallCorner, off: { dx: number; dy: number }): boolean {
  const s = wallSketch(d, wallId);
  if (!s) return false;
  const bottom = corner === 'bl' || corner === 'br';
  const curve = s.corners?.[corner]?.curve;
  const v = { dx: Math.round(off.dx * 100) / 100, dy: bottom ? 0 : Math.round(off.dy * 100) / 100, ...(curve ? { curve } : {}) };
  const before = s.corners ? plain(s.corners) : undefined;
  s.corners = { ...(s.corners ?? {}), [corner]: v };
  if (!v.dx && !v.dy && !curve) delete s.corners[corner];
  if (!Object.keys(s.corners).length) delete s.corners;
  // an outline that would cross itself is refused, as moveVertex does (BUGFIX_PLAN B10)
  if (!isSimplePolygon(sketchRing(d.panels[wallId]).map((e) => e.a))) {
    if (before) s.corners = before;
    else delete s.corners;
    return false;
  }
  solve(d);
  return true;
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

/** An outline point that can be curved: a base polygon's vertex (index), a wall's top corner or inserted point (id). */
export type OutlinePoint = number | 'tl' | 'tr' | string;

/** The edge keys either side of an outline point (from the straight sketch), or null when it has none. */
function pointEdges(p: Panel, pt: OutlinePoint): string[] | null {
  const ring = straightRing(p);
  const s = p.sketch;
  let at: P2 | undefined;
  if (s.kind === 'poly') at = typeof pt === 'number' ? s.pts[pt] : undefined;
  else if (pt === 'tl' || pt === 'tr') at = ring.find((e) => e.key === (pt === 'tr' ? 'e2' : 'e3'))?.a;
  else at = ring.find((e) => e.key === pt)?.a;
  if (!at) return null;
  const same = (q: P2) => Math.hypot(q.x - at!.x, q.y - at!.y) < 1e-6;
  return ring.filter((e) => same(e.a) || same(e.b)).map((e) => e.key);
}

/**
 * Why an outline point cannot become a curve, or null: an edge either side of
 * it carries a joint, a grown panel or a fold-over (a curved edge holds none).
 */
export function curveBlocked(d: Design, panelId: string, pt: OutlinePoint): 'joined' | 'none' | null {
  const p = d.panels[panelId];
  const keys = p && pointEdges(p, pt);
  if (!p || !keys) return 'none';
  const set = new Set(keys);
  const on = (r: { panelId: string; edge: string }) => r.panelId === panelId && set.has(baseKey(r.edge));
  if (Object.values(d.connections).some((c) => on(c.a) || on(c.b))) return 'joined';
  if ((p.foldOvers ?? []).some((f) => set.has(f.edge))) return 'joined';
  return null;
}

/** Is this outline point an auto curve? */
export function pointCurve(d: Design, panelId: string, pt: OutlinePoint): boolean {
  const s = d.panels[panelId]?.sketch;
  if (!s) return false;
  if (s.kind === 'poly') return typeof pt === 'number' && !!s.pts[pt]?.curve;
  if (pt === 'tl' || pt === 'tr') return !!s.corners?.[pt]?.curve;
  return !!s.inserts?.find((x) => x.id === pt)?.curve;
}

/** Make an outline point a smooth (auto) curve or a corner again. Refused while an edge beside it is joined. */
export function setPointCurve(d: Design, panelId: string, pt: OutlinePoint, on: boolean): boolean {
  const p = d.panels[panelId];
  if (!p) return false;
  if (on && curveBlocked(d, panelId, pt)) return false;
  const s = p.sketch;
  if (s.kind === 'poly') {
    if (typeof pt !== 'number' || !s.pts[pt] || parentConnection(d, panelId)) return false;
    const q = { ...s.pts[pt] };
    if (on) q.curve = 'auto';
    else delete q.curve;
    s.pts = s.pts.map((x, k) => (k === pt ? q : x));
    normalizeSketch(p);
  } else if (pt === 'tl' || pt === 'tr') {
    const c = { dx: 0, dy: 0, ...s.corners?.[pt] };
    if (on) c.curve = 'auto';
    else delete c.curve;
    s.corners = { ...(s.corners ?? {}), [pt]: c };
    if (!c.dx && !c.dy && !c.curve) delete s.corners[pt];
    if (!Object.keys(s.corners).length) delete s.corners;
  } else {
    const ins = s.inserts?.find((x) => x.id === pt);
    if (!ins) return false;
    if (on) ins.curve = 'auto';
    else delete ins.curve;
  }
  solve(d);
  return true;
}

/** Can this wall edge take a fold-over: card or corrugated, a grown wall, a free edge? */
export function canFoldOver(d: Design, wallId: string, edge: string): boolean {
  const p = d.panels[wallId];
  if (!p || matOf(d, wallId).kind === 'plywood' || !parentConnection(d, wallId) || !findEdge(p, edge)) return false;
  if (edge === 'e0' || edgeConnection(d, wallId, edge)) return false;
  return !(p.foldOvers ?? []).some((f) => f.edge === edge);
}

/** Add a fold-over on a wall's free edge (default: its top). Lock tabs on corrugated, glue on card. */
export function addFoldOver(d: Design, wallId: string, edge = 'e2'): string | null {
  if (!canFoldOver(d, wallId, edge)) return null;
  const p = d.panels[wallId];
  const id = newId('f');
  p.foldOvers = [...(p.foldOvers ?? []), { id, edge, depth: null, lock: matOf(d, wallId).kind === 'corrugated' ? 'tabs' : 'glue', locks: null, lockDepth: null }];
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
  // panels placed on it drop to the floor where they are (milestone 28)
  for (const id of hostedOn(d, panelId)) {
    dropToFloor(d, d.panels[id]);
    for (const c of Object.values(d.connections)) if (!c.grown && ((c.a.panelId === id && c.b.panelId === panelId) || (c.b.panelId === id && c.a.panelId === panelId))) delete d.connections[c.id];
  }
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
  for (const k of Object.keys(d.placements)) if (pieceRoot(placementPiece(k)) === panelId) delete d.placements[k];
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
  const was = d.material.kind;
  const prev = d.material;
  d.material = { ...m };
  // boards naming the old working material keep it
  normalizeMaterials(d, prev);
  solve(d);
  if (m.kind !== was) applyJointChoices(d);
}

/**
 * Give boards their own material (milestone 36), or put them back on the
 * working material (`m` null, or the working material itself). Their colour,
 * thickness and joints follow; a joint whose kind the new pair of materials
 * does not allow falls back (its wish is kept, so switching back restores it),
 * and a board leaving its fold net's material is cut as its own piece.
 * Returns the joints that changed kind because of it.
 */
export function setPanelMaterial(d: Design, ids: string[], m: MaterialProfile | null): { id: string; from: ConnectionKind; to: ConnectionKind }[] {
  const before = new Map(Object.values(d.connections).map((c) => [c.id, c.kind]));
  for (const id of ids) {
    const p = d.panels[id];
    if (!p) continue;
    if (!m || m.id === d.material.id) delete p.material;
    else {
      d.materials ??= {};
      // the design keeps its own copy of a profile (edited in the drawer)
      d.materials[m.id] ??= { ...m };
      p.material = m.id;
    }
  }
  solve(d);
  // thicker or thinner boards may now meet others differently
  for (const id of ids) if (d.panels[id]) connectSeams(d, id);
  const out: { id: string; from: ConnectionKind; to: ConnectionKind }[] = [];
  for (const c of Object.values(d.connections)) {
    const was = before.get(c.id);
    if (was && was !== c.kind && (ids.includes(c.a.panelId) || ids.includes(c.b.panelId))) out.push({ id: c.id, from: was, to: c.kind });
  }
  return out;
}

/** Change one of the design's other materials (kerf, clearance, …: the drawer lists every material in use). */
export function editMaterial(d: Design, id: string, patch: Partial<MaterialProfile>) {
  if (id === d.material.id) Object.assign(d.material, patch);
  else {
    const m = d.materials?.[id];
    if (!m) return;
    Object.assign(m, patch);
  }
  solve(d);
}

/** Apply the current material's stored joint choices to every joint (after a change of material kind). */
export function applyJointChoices(d: Design) {
  const j = jointsOf(d);
  for (const g of ['base', 'corner'] as const) {
    const k = j?.[g];
    if (k) setAllJoints(d, g, k);
  }
}

export type ConnPatch = Partial<Pick<Connection, 'kind' | 'fingers' | 'tabs' | 'flap' | 'foldDir' | 'angle' | 'offset' | 'dir' | 'tabLen' | 'lockDepth'>>;

export function setConnection(d: Design, connectionId: string, patch: ConnPatch) {
  const c = d.connections[connectionId];
  if (!c) return;
  if (patch.angle !== undefined && c.grown) {
    c.angle = patch.angle;
    fitKind(c, pairKinds(d, c));
  }
  if (patch.kind) {
    const allowed = pairKinds(d, c);
    if (allowed.includes(patch.kind)) {
      applyKind(d, c, patch.kind, patch.offset !== undefined);
      c.auto = false;
    }
  }
  if (patch.fingers !== undefined) c.fingers = patch.fingers === null ? null : Math.max(3, Math.round(patch.fingers) | 1);
  if (patch.tabs !== undefined) c.tabs = patch.tabs === null ? null : Math.max(1, Math.round(patch.tabs));
  if (patch.flap !== undefined) c.flap = patch.flap === null ? null : Math.max(3, patch.flap);
  if (patch.foldDir) c.foldDir = patch.foldDir;
  if (patch.tabLen) {
    if (patch.tabLen !== 'flush') c.tabLen = patch.tabLen;
    else delete c.tabLen;
    c.auto = false;
  }
  if (patch.lockDepth !== undefined) c.lockDepth = patch.lockDepth === null ? null : Math.max(2, patch.lockDepth);
  if (patch.dir && c.grown) c.dir = patch.dir;
  if (patch.offset !== undefined && c.grown) c.offset = Math.max(0, patch.offset);
  solve(d);
  if (c.grown && c.kind === 'lean') connectSeams(d, c.b.panelId);
}

/** Set a joint's kind (and wish), moving a grown panel to or from the tab-and-slot stand-in. */
function applyKind(d: Design, c: Connection, kind: ConnectionKind, keepOffset = false) {
  c.kind = kind;
  c.pref = kind;
  if (c.grown && c.kind !== 'tabslot' && !keepOffset && c.offset > 0 && !isDividerOffset(d, c)) c.offset = 0;
  if (c.grown && c.kind === 'tabslot' && c.offset === 0) c.offset = defaultOffset(d, 'tabslot', c.a.panelId);
}

/**
 * Design-wide joint kind for a group (*Wall to base* or *Corners*): every
 * joint of the group that may take `kind` takes it, including joints set by
 * hand (they stay hand-set or automatic as they were); trays take it for their
 * walls or corners where a tray allows it; and it becomes the default for new
 * joints of the group. Returns how many joints changed and how many kept
 * their kind because `kind` is not allowed for them (angle, seam type).
 */
export function setAllJoints(d: Design, group: JointGroup, kind: ConnectionKind): { changed: number; kept: number } {
  let changed = 0, kept = 0;
  for (const c of groupConnections(d, group)) {
    // the working material's choice: joints carried by boards of another material kind keep that kind's choices
    if (ownerMaterial(d, c).kind !== d.material.kind) continue;
    if (!allowedKinds(d, c).includes(kind)) {
      if (c.kind !== kind) kept++;
      continue;
    }
    if (c.kind !== kind) changed++;
    applyKind(d, c, kind);
  }
  for (const tray of Object.values(d.trays ?? {})) {
    const tm = matOf(d, tray.baseId);
    if (tm.kind !== d.material.kind) continue;
    if (group === 'base' && connectionsFor(tm, 90).includes(kind)) tray.wallKind = kind;
    if (group === 'corner' && seamKinds(tm, 'corner').includes(kind)) tray.cornerKind = kind;
  }
  patchJoints(d, { [group]: kind });
  solve(d);
  return { changed, kept };
}

/** The design's glue flap width (mm), replacing the automatic width on joints without their own; null: automatic. */
export function setDefaultFlap(d: Design, width: number | null) {
  patchJoints(d, { flap: width === null ? null : Math.max(3, Math.min(100, width)) });
  solve(d);
}

/** A grown connection standing well inside its parent (a divider), not at the edge. */
function isDividerOffset(d: Design, c: Connection) {
  const m = matOf(d, c.a.panelId);
  return c.offset > 2 * m.thickness + minWeb(m);
}

/** A tray's flat height on a base and the walls changed at `height` (milestone 35; see `flatInfo`). */
export function trayFlatInfo(d: Design, baseId: string, height: number) {
  return flatInfo(d, baseId, height, (probe, b, h, spec) => addTray(probe, b, h, spec), solve);
}

/** Keep a tray's net whole (`off`, the export check reports any overlap) or let the app make it lie flat (`auto`). */
export function setTrayFlat(d: Design, trayId: string, flat: 'auto' | 'off') {
  const t = d.trays?.[trayId];
  if (!t) return;
  if (flat === 'auto') delete t.flat;
  else t.flat = 'off';
  solve(d);
}

/** The student's choice for a wall the app changed so the net lies flat (null: the app's choice). */
export function setTrayPin(d: Design, trayId: string, edge: string, pin: 'hinge' | 'own' | 'other' | null) {
  const t = d.trays?.[trayId];
  if (!t) return;
  const p = { ...(t.pin ?? {}) };
  if (pin) p[edge] = pin;
  else delete p[edge];
  if (Object.keys(p).length) t.pin = p;
  else delete t.pin;
  solve(d);
}

/** Lay a placed panel flat on its face or stand it up on its bottom line (milestone 29); it keeps its place and size. */
export function setPlacedPose(d: Design, panelId: string, pose: 'flat' | 'standing') {
  const p = d.panels[panelId];
  if (!p?.place || p.place.pose === pose) return;
  p.place = { ...p.place, pose, ...(pose === 'standing' ? { side: p.place.side ?? 1 } : {}) };
  if (pose === 'flat') delete p.place.side;
  // a flat panel is not joined to its host
  if (pose === 'flat') for (const c of Object.values(d.connections)) if (!c.grown && p.place.host && ((c.a.panelId === panelId && c.b.panelId === p.place.host) || (c.b.panelId === panelId && c.a.panelId === p.place.host))) delete d.connections[c.id];
  solve(d);
  if (pose === 'standing') connectSeams(d, panelId);
}
