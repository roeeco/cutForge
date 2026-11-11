// Structural check of a loaded design (BUGFIX_PLAN B3): project files and class
// submissions come from outside, so before `solve` sees one, every field the
// model reads is checked for its type, and every number for being finite and
// within a sane range. What is clearly safe to drop (a placement or a
// connection naming a board that is not there) is dropped; anything else
// throws, and the loader turns that into a "damaged file" error.
import type { Design } from './types';

/** No coordinate or size in a design is anywhere near this (mm). */
export const COORD_LIMIT = 100_000;

export class DamagedError extends Error {}

const fail = (where: string, what: string): never => {
  throw new DamagedError(`${where}: ${what}`);
};

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
/** Ids the model looks up in plain objects: never a name Object.prototype has. */
const badId = (k: unknown) => typeof k !== 'string' || !k.length || k === '__proto__' || k in Object.prototype;

function num(v: unknown, where: string, { min = -COORD_LIMIT, max = COORD_LIMIT } = {}): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(where, `not a number (${JSON.stringify(v)})`);
  if ((v as number) < min || (v as number) > max) fail(where, `out of range (${v})`);
  return v as number;
}
const optNum = (v: unknown, where: string, range?: { min?: number; max?: number }) => (v === undefined || v === null ? v : num(v, where, range));
const str = (v: unknown, where: string) => (typeof v === 'string' ? v : fail(where, 'not text'));
const oneOf = <T,>(v: unknown, all: readonly T[], where: string): T => (all.includes(v as T) ? (v as T) : fail(where, `unknown value ${JSON.stringify(v)}`));
const arr = (v: unknown, where: string): any[] => (Array.isArray(v) ? v : fail(where, 'not a list'));

const MATERIAL_KINDS = ['card', 'corrugated', 'plywood'] as const;
const CONNECTION_KINDS = ['finger', 'tabslot', 'slide', 'fold', 'glue', 'halflap', 'lean', 'teeth', 'wrap', 'butt'] as const;
const SHAPES = ['rect', 'roundrect', 'circle', 'text', 'path', 'polygon'] as const;
const OPS = ['add', 'cut', 'engrave', 'score'] as const;
const TAB_LOCKS = ['flush', 'through', 'snap', 'bolt'] as const;

function point(p: unknown, where: string, limit = COORD_LIMIT) {
  if (!isObj(p)) fail(where, 'not a point');
  num((p as any).x, `${where}.x`, { min: -limit, max: limit });
  num((p as any).y, `${where}.y`, { min: -limit, max: limit });
}

function v3(v: unknown, where: string, unit = false) {
  const a = arr(v, where);
  if (a.length !== 3) fail(where, 'not a 3D vector');
  a.forEach((x, i) => num(x, `${where}[${i}]`));
  if (unit) {
    const l = Math.hypot(a[0], a[1], a[2]);
    if (Math.abs(l - 1) > 1e-3) fail(where, `not a unit vector (length ${l})`);
  }
}

function material(m: unknown, where: string) {
  if (!isObj(m)) fail(where, 'not a material');
  const p = m as Record<string, any>;
  str(p.id, `${where}.id`);
  oneOf(p.kind, MATERIAL_KINDS, `${where}.kind`);
  if (typeof p.nameKey !== 'string') p.nameKey = String(p.id);
  num(p.thickness, `${where}.thickness`, { min: 0.05, max: 100 });
  num(p.kerf, `${where}.kerf`, { min: 0, max: 10 });
  num(p.clearance, `${where}.clearance`, { min: -10, max: 10 });
  num(p.foldAllowance, `${where}.foldAllowance`, { min: 0, max: 100 });
  num(p.sheetW, `${where}.sheetW`, { min: 1, max: COORD_LIMIT });
  num(p.sheetH, `${where}.sheetH`, { min: 1, max: COORD_LIMIT });
  oneOf(p.grain, ['x', 'y', 'none'] as const, `${where}.grain`);
  if (p.bend !== undefined) {
    if (!isObj(p.bend)) fail(`${where}.bend`, 'not bend limits');
    for (const k of ['smoothR', 'patternR', 'pitch', 'k'] as const) num(p.bend[k], `${where}.bend.${k}`, { min: 0, max: COORD_LIMIT });
  }
}

function detail(dt: unknown, where: string) {
  if (!isObj(dt)) fail(where, 'not a shape');
  const x = dt as Record<string, any>;
  if (badId(x.id)) fail(`${where}.id`, 'bad id');
  oneOf(x.shape, SHAPES, `${where}.shape`);
  oneOf(x.op, OPS, `${where}.op`);
  num(x.cx, `${where}.cx`);
  num(x.cy, `${where}.cy`);
  num(x.w, `${where}.w`, { min: 0 });
  num(x.h, `${where}.h`, { min: 0 });
  optNum(x.r, `${where}.r`, { min: 0 });
  optNum(x.rot, `${where}.rot`);
  if (x.text !== undefined) {
    if (!isObj(x.text)) fail(`${where}.text`, 'not text');
    str(x.text.value, `${where}.text.value`);
    str(x.text.font, `${where}.text.font`);
    num(x.text.size, `${where}.text.size`, { min: 0 });
  }
  if (x.shape === 'text' && !x.text) fail(`${where}.text`, 'missing');
  if (x.path !== undefined) {
    if (!isObj(x.path)) fail(`${where}.path`, 'not a path');
    // a unit box (-0.5..0.5), a little room for imported paths
    arr(x.path.polys, `${where}.path.polys`).forEach((poly, i) => arr(poly, `${where}.path.polys[${i}]`).forEach((q, j) => point(q, `${where}.path.polys[${i}][${j}]`, 10)));
  }
  if ((x.shape === 'path' || x.shape === 'polygon') && !x.path) fail(`${where}.path`, 'missing');
  if (x.regular !== undefined && x.regular !== null) {
    if (!isObj(x.regular)) fail(`${where}.regular`, 'not an object');
    num(x.regular.n, `${where}.regular.n`, { min: 3, max: 1000 });
  }
  if (x.array !== undefined && x.array !== null) {
    if (!isObj(x.array)) fail(`${where}.array`, 'not an array setting');
    const a = x.array;
    num(a.nx, `${where}.array.nx`, { min: 1, max: 1000 });
    num(a.ny, `${where}.array.ny`, { min: 1, max: 1000 });
    if (a.nx * a.ny > 10_000) fail(`${where}.array`, 'too many copies');
    num(a.dx, `${where}.array.dx`);
    num(a.dy, `${where}.array.dy`);
  }
}

function sketch(s: unknown, where: string) {
  if (!isObj(s)) fail(where, 'not a sketch');
  const k = s as Record<string, any>;
  if (k.kind === 'poly') {
    const pts = arr(k.pts, `${where}.pts`);
    if (pts.length < 3) fail(`${where}.pts`, 'fewer than 3 points');
    pts.forEach((q, i) => {
      point(q, `${where}.pts[${i}]`);
      if (q.curve !== undefined && q.curve !== 'auto' && q.curve !== 'round') fail(`${where}.pts[${i}].curve`, 'unknown curve');
      if (q.r !== undefined) num(q.r, `${where}.pts[${i}].r`, { min: 0 });
      if (q.curve === 'round' && !(typeof q.r === 'number' && q.r > 0)) fail(`${where}.pts[${i}].r`, 'a rounded corner needs a radius');
    });
    const ids = arr(k.edgeIds, `${where}.edgeIds`);
    if (ids.length !== pts.length) fail(`${where}.edgeIds`, 'one id per point needed');
    ids.forEach((e, i) => str(e, `${where}.edgeIds[${i}]`));
    if (new Set(ids).size !== ids.length) fail(`${where}.edgeIds`, 'repeated edge ids');
    if (k.round !== undefined) {
      if (!isObj(k.round)) fail(`${where}.round`, 'not a round shape');
      oneOf(k.round.shape, ['circle', 'oval', 'stadium'] as const, `${where}.round.shape`);
      if (k.round.rEnd !== undefined) num(k.round.rEnd, `${where}.round.rEnd`, { min: 0 });
    }
  } else if (k.kind === 'wall') {
    // a matched wall's leader (milestone 46): a link to a board that is not there is dropped (solve keeps the shape)
    if (k.match !== undefined && typeof k.match !== 'string') delete k.match;
    if (k.corners !== undefined) {
      if (!isObj(k.corners)) fail(`${where}.corners`, 'not an object');
      for (const c of Object.keys(k.corners)) {
        oneOf(c, ['tl', 'tr', 'bl', 'br'] as const, `${where}.corners`);
        const o = k.corners[c];
        if (!isObj(o)) fail(`${where}.corners.${c}`, 'not an offset');
        num(o.dx, `${where}.corners.${c}.dx`);
        num(o.dy, `${where}.corners.${c}.dy`);
      }
    }
    if (k.inserts !== undefined) {
      arr(k.inserts, `${where}.inserts`).forEach((q, i) => {
        if (!isObj(q)) fail(`${where}.inserts[${i}]`, 'not a point');
        if (badId(q.id)) fail(`${where}.inserts[${i}].id`, 'bad id');
        oneOf(q.edge, ['e1', 'e2', 'e3'] as const, `${where}.inserts[${i}].edge`);
        num(q.t, `${where}.inserts[${i}].t`, { min: 0, max: 1 });
        num(q.off, `${where}.inserts[${i}].off`);
      });
    }
  } else fail(`${where}.kind`, 'unknown sketch');
}

function panel(p: unknown, key: string, d: Record<string, any>) {
  const where = `panels.${key}`;
  if (!isObj(p)) fail(where, 'not a board');
  const x = p as Record<string, any>;
  if (x.id !== key) fail(`${where}.id`, 'does not match its key');
  if (typeof x.name !== 'string') x.name = key;
  num(x.w, `${where}.w`, { min: 0 });
  num(x.h, `${where}.h`, { min: 0 });
  if (x.sketch !== undefined) sketch(x.sketch, `${where}.sketch`);
  if (!isObj(x.frame)) fail(`${where}.frame`, 'missing');
  v3(x.frame.o, `${where}.frame.o`);
  v3(x.frame.u, `${where}.frame.u`, true);
  v3(x.frame.v, `${where}.frame.v`, true);
  if (x.frame.side !== 1 && x.frame.side !== -1) fail(`${where}.frame.side`, 'not 1 or -1');
  arr(x.details, `${where}.details`).forEach((dt, i) => detail(dt, `${where}.details[${i}]`));
  if (x.foldOvers !== undefined) {
    arr(x.foldOvers, `${where}.foldOvers`).forEach((f, i) => {
      const w = `${where}.foldOvers[${i}]`;
      if (!isObj(f)) fail(w, 'not a fold-over');
      if (badId(f.id)) fail(`${w}.id`, 'bad id');
      str(f.edge, `${w}.edge`);
      if (f.depth !== null) num(f.depth, `${w}.depth`, { min: 0 });
      oneOf(f.lock, ['glue', 'tabs'] as const, `${w}.lock`);
      if (f.locks !== null) num(f.locks, `${w}.locks`, { min: 0, max: 100 });
      if (f.lockDepth !== null) num(f.lockDepth, `${w}.lockDepth`, { min: 0 });
    });
  }
  // derived: solve re-makes it (milestone 46)
  delete x.bent;
  if (x.ext !== undefined) {
    if (!isObj(x.ext)) delete x.ext; // derived: solve re-makes it
    else if (!Number.isFinite(x.ext.s) || !Number.isFinite(x.ext.e)) delete x.ext;
  }
  if (x.material !== undefined && typeof x.material !== 'string') fail(`${where}.material`, 'not a material id');
  if (x.place !== undefined) {
    const pl = x.place;
    const w = `${where}.place`;
    if (!isObj(pl)) fail(w, 'not a placement');
    if (pl.host !== null && (badId(pl.host) || !own(d.panels, pl.host) || pl.host === key)) pl.host = null; // a host that is gone: the floor
    if (pl.face !== 1 && pl.face !== -1) fail(`${w}.face`, 'not 1 or -1');
    num(pl.x, `${w}.x`);
    num(pl.y, `${w}.y`);
    num(pl.rot, `${w}.rot`, { min: -1e6, max: 1e6 });
    oneOf(pl.pose, ['flat', 'standing'] as const, `${w}.pose`);
    if (pl.side !== undefined && pl.side !== 1 && pl.side !== -1) fail(`${w}.side`, 'not 1 or -1');
  }
  if (x.divider !== undefined) {
    const dv = x.divider;
    const w = `${where}.divider`;
    if (!isObj(dv) || !isObj(x.place) || x.place.pose !== 'standing') fail(w, 'not a divider');
    point(dv.at, `${w}.at`);
    num(dv.rot, `${w}.rot`, { min: -1e6, max: 1e6 });
    if (!Array.isArray(dv.reach) || dv.reach.length !== 2) fail(`${w}.reach`, 'not two numbers');
    num(dv.reach[0], `${w}.reach[0]`, { max: 0 });
    num(dv.reach[1], `${w}.reach[1]`, { min: 0 });
  }
}

function edgeRef(r: unknown, where: string) {
  if (!isObj(r)) fail(where, 'not an edge');
  str((r as any).panelId, `${where}.panelId`);
  str((r as any).edge, `${where}.edge`);
}

function finiteDeep(v: unknown, depth = 0): boolean {
  if (depth > 12) return true;
  if (typeof v === 'number') return Number.isFinite(v) && Math.abs(v) <= COORD_LIMIT * 10;
  if (Array.isArray(v)) return v.every((x) => finiteDeep(x, depth + 1));
  if (isObj(v)) return Object.values(v).every((x) => finiteDeep(x, depth + 1));
  return true;
}

const ptOk = (q: unknown) => isObj(q) && Number.isFinite(q.x) && Number.isFinite(q.y) && Math.abs(q.x) <= COORD_LIMIT && Math.abs(q.y) <= COORD_LIMIT;
const polyOk = (p: unknown) => Array.isArray(p) && p.every(ptOk);
const listOk = (v: unknown, f: (x: any) => boolean) => Array.isArray(v) && v.every((x) => isObj(x) && typeof x.panelId === 'string' && f(x));
/** A joint's stored geometry is shaped as `ConnGeom` and finite throughout. */
function geomOk(g: unknown): boolean {
  if (!isObj(g) || !finiteDeep(g)) return false;
  return (
    listOk(g.edges, (e) => typeof e.edge === 'string' && Array.isArray(e.notches) && e.notches.every((n: any) => isObj(n) && [n.s0, n.s1, n.depth].every(Number.isFinite))) &&
    listOk(g.holes, (h) => polyOk(h.poly)) &&
    listOk(g.adds, (a) => polyOk(a.poly)) &&
    listOk(g.scores, (k) => ptOk(k.a) && ptOk(k.b)) &&
    listOk(g.flaps3d, (f) => polyOk(f.poly) && Number.isFinite(f.z0) && Number.isFinite(f.z1)) &&
    (g.cuts === undefined || listOk(g.cuts, (k) => polyOk(k.poly)))
  );
}

function connection(c: unknown, key: string, d: Record<string, any>): boolean {
  const where = `connections.${key}`;
  if (!isObj(c)) fail(where, 'not a joint');
  const x = c as Record<string, any>;
  if (x.id !== key) fail(`${where}.id`, 'does not match its key');
  edgeRef(x.a, `${where}.a`);
  edgeRef(x.b, `${where}.b`);
  // a joint to a board that is not there: nothing to join, dropped
  if (badId(x.a.panelId) || badId(x.b.panelId) || !own(d.panels, x.a.panelId) || !own(d.panels, x.b.panelId)) return false;
  oneOf(x.kind, CONNECTION_KINDS, `${where}.kind`);
  if (x.pref !== undefined) oneOf(x.pref, CONNECTION_KINDS, `${where}.pref`);
  if (typeof x.grown !== 'boolean') fail(`${where}.grown`, 'not true or false');
  num(x.angle, `${where}.angle`, { min: -360, max: 360 });
  oneOf(x.dir, ['up', 'down'] as const, `${where}.dir`);
  num(x.offset, `${where}.offset`);
  if (x.span !== undefined && x.span !== null) {
    const s = arr(x.span, `${where}.span`);
    if (s.length !== 2) fail(`${where}.span`, 'not a range');
    s.forEach((v, i) => num(v, `${where}.span[${i}]`));
  }
  if (x.fingers !== null && x.fingers !== undefined) num(x.fingers, `${where}.fingers`, { min: 0, max: 999 });
  if (x.tabs !== null && x.tabs !== undefined) num(x.tabs, `${where}.tabs`, { min: 0, max: 999 });
  if (x.flap !== null && x.flap !== undefined) num(x.flap, `${where}.flap`, { min: 0, max: 1000 });
  oneOf(x.foldDir, ['valley', 'mountain'] as const, `${where}.foldDir`);
  if (x.tabLen !== undefined) oneOf(x.tabLen, TAB_LOCKS, `${where}.tabLen`);
  if (x.lockDepth !== undefined && x.lockDepth !== null) num(x.lockDepth, `${where}.lockDepth`, { min: 0, max: 1000 });
  if (x.trayId !== undefined && typeof x.trayId !== 'string') fail(`${where}.trayId`, 'not an id');
  if (x.hingeOf !== undefined && typeof x.hingeOf !== 'string') delete x.hingeOf; // derived
  // the last valid joint geometry: derived, and only kept for a broken joint; a damaged one is dropped
  if (x.geom !== undefined && !geomOk(x.geom)) delete x.geom;
  return true;
}

function tray(t: unknown, key: string, d: Record<string, any>): boolean {
  const where = `trays.${key}`;
  if (!isObj(t)) fail(where, 'not a tray');
  const x = t as Record<string, any>;
  if (x.id !== key) fail(`${where}.id`, 'does not match its key');
  if (badId(x.baseId) || !own(d.panels, x.baseId)) return false; // its base is gone: dropped
  num(x.height, `${where}.height`, { min: 0 });
  oneOf(x.wallKind, CONNECTION_KINDS, `${where}.wallKind`);
  oneOf(x.cornerKind, CONNECTION_KINDS, `${where}.cornerKind`);
  if (x.curveKind !== undefined) oneOf(x.curveKind, CONNECTION_KINDS, `${where}.curveKind`);
  if (x.lidOf !== undefined && typeof x.lidOf !== 'string') delete x.lidOf;
  arr(x.openEdges, `${where}.openEdges`).forEach((e, i) => str(e, `${where}.openEdges[${i}]`));
  if (x.tabLen !== undefined) oneOf(x.tabLen, TAB_LOCKS, `${where}.tabLen`);
  if (x.flat !== undefined) oneOf(x.flat, ['auto', 'off'] as const, `${where}.flat`);
  // derived (re-made by solve)
  if (x.fixes !== undefined && !isObj(x.fixes)) delete x.fixes;
  if (x.fixPlan !== undefined && !isObj(x.fixPlan)) delete x.fixPlan;
  if (x.pin !== undefined) {
    if (!isObj(x.pin)) delete x.pin;
    else for (const k of Object.keys(x.pin)) if (!['hinge', 'own', 'other'].includes(x.pin[k])) delete x.pin[k];
  }
  return true;
}

/**
 * Check (and repair what is safe to repair in) a migrated design, in place.
 * Throws `DamagedError` naming the first field that is wrong.
 */
export function checkDesign(raw: unknown): asserts raw is Design {
  if (!isObj(raw)) fail('design', 'not an object');
  const d = raw as Record<string, any>;
  if (typeof d.id !== 'string') d.id = 'loaded';
  if (typeof d.name !== 'string') d.name = '';
  material(d.material, 'material');
  if (d.materials !== undefined) {
    if (!isObj(d.materials)) fail('materials', 'not a list of materials');
    for (const k of Object.keys(d.materials)) {
      if (badId(k)) fail(`materials.${k}`, 'bad id');
      material(d.materials[k], `materials.${k}`);
    }
  }
  if (!isObj(d.panels)) fail('panels', 'not a list of boards');
  for (const k of Object.keys(d.panels)) if (badId(k)) fail(`panels.${k}`, 'bad id');
  // a board's material must be one the design knows (or a built-in id, resolved by matOf)
  for (const k of Object.keys(d.panels)) panel(d.panels[k], k, d);
  d.order = arr(d.order, 'order').filter((id, i, all) => typeof id === 'string' && own(d.panels, id) && all.indexOf(id) === i);
  for (const k of Object.keys(d.panels)) if (!d.order.includes(k)) d.order.push(k);
  if (!isObj(d.connections)) fail('connections', 'not a list of joints');
  for (const k of Object.keys(d.connections)) {
    if (badId(k)) fail(`connections.${k}`, 'bad id');
    if (!connection(d.connections[k], k, d)) delete d.connections[k];
  }
  if (!isObj(d.trays)) d.trays = {};
  for (const k of Object.keys(d.trays)) {
    if (badId(k)) fail(`trays.${k}`, 'bad id');
    if (!tray(d.trays[k], k, d)) delete d.trays[k];
  }
  // quantities and sheet placements: a bad one falls back to the default (one copy, placed automatically)
  if (!isObj(d.pieces)) d.pieces = {};
  for (const k of Object.keys(d.pieces)) {
    const q = d.pieces[k];
    if (badId(k) || !isObj(q) || !Number.isInteger(q.quantity) || q.quantity < 0 || q.quantity > 999) delete d.pieces[k];
  }
  if (!isObj(d.placements)) d.placements = {};
  for (const k of Object.keys(d.placements)) {
    const q = d.placements[k];
    const ok =
      !badId(k) &&
      isObj(q) &&
      Number.isInteger(q.sheet) &&
      q.sheet >= 0 &&
      q.sheet < 10_000 &&
      Number.isFinite(q.x) &&
      Number.isFinite(q.y) &&
      Math.abs(q.x) <= COORD_LIMIT &&
      Math.abs(q.y) <= COORD_LIMIT &&
      (q.rot === 0 || q.rot === 90) &&
      typeof q.manual === 'boolean' &&
      (q.mat === undefined || typeof q.mat === 'string');
    if (!ok) delete d.placements[k];
  }
  if (typeof d.sheetSpacing !== 'number' || !Number.isFinite(d.sheetSpacing) || d.sheetSpacing < 0 || d.sheetSpacing > 1000) d.sheetSpacing = 3;
  if (typeof d.sheetMargin !== 'number' || !Number.isFinite(d.sheetMargin) || d.sheetMargin < 0 || d.sheetMargin > 1000) d.sheetMargin = 5;
  if (d.allowRotate !== undefined && typeof d.allowRotate !== 'boolean') d.allowRotate = false;
  if (d.noAutoSeams !== undefined) d.noAutoSeams = Array.isArray(d.noAutoSeams) ? d.noAutoSeams.filter((x: unknown) => typeof x === 'string') : [];
  if (d.contents !== undefined) {
    d.contents = Array.isArray(d.contents)
      ? d.contents.filter(
          (c: any) =>
            isObj(c) &&
            typeof c.id === 'string' &&
            typeof c.object === 'string' &&
            typeof c.baseId === 'string' &&
            own(d.panels, c.baseId) &&
            [c.x, c.y].every((v) => Number.isFinite(v) && Math.abs(v) <= COORD_LIMIT) &&
            [c.count, c.w, c.d, c.h].every((v) => v === undefined || (Number.isFinite(v) && v >= 0 && v <= COORD_LIMIT)),
        )
      : undefined;
  }
  if (d.joints !== undefined && !isObj(d.joints)) delete d.joints;
  if (d.template !== undefined && !(isObj(d.template) && typeof d.template.id === 'string' && isObj(d.template.params))) delete d.template;
  if (d.mission !== undefined && !(isObj(d.mission) && typeof d.mission.id === 'string')) delete d.mission;
}

/** After solving: every board's size and frame is finite (a value the check let through can still blow up). */
export function checkSolved(d: Design) {
  for (const id of d.order) {
    const p = d.panels[id];
    if (!Number.isFinite(p.w) || !Number.isFinite(p.h) || Math.abs(p.w) > COORD_LIMIT * 10 || Math.abs(p.h) > COORD_LIMIT * 10) fail(`panels.${id}`, 'size blew up');
    if (![...p.frame.o, ...p.frame.u, ...p.frame.v].every(Number.isFinite)) fail(`panels.${id}.frame`, 'not finite');
    // a wall grown off an edge of no length has no direction
    v3(p.frame.u, `panels.${id}.frame.u`, true);
    v3(p.frame.v, `panels.${id}.frame.v`, true);
  }
}
