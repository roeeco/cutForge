// Design-wide joint kinds (milestone 23). Joints fall in two groups: *wall to
// base* (a grown panel on the panel it grows from, and an edge standing on a
// face: dividers, edge-on-face seams) and *corners* (wall-to-wall closing
// seams). Crossing half-laps are in neither. Each group's list offers the
// kinds the material allows for at least one of its joints; the design's
// choice is the default for new joints of that group where allowed.
import type { Connection, ConnectionKind, Design, DesignJoints, MaterialKind, MaterialProfile } from './types';
import { connectionsFor, connectionsForPair, matOf, minWeb } from './materials';
import { autoFlap, seamKinds, seamTypeOf } from './seams';
import { trayKinds } from './trays';

export type JointGroup = 'base' | 'corner';

const KINDS: MaterialKind[] = ['plywood', 'card', 'corrugated'];

/**
 * Read an older file's flat joint choices (`{ base, corner, flap }`) into the
 * current material's slot, and drop empty slots. Run on load and by `solve`.
 */
export function normalizeJoints(d: Design) {
  const j = d.joints as (Record<string, unknown> & DesignJoints) | undefined;
  if (!j) return;
  if ('base' in j || 'corner' in j || 'flap' in j) {
    const flat: DesignJoints = {};
    if (j.base) flat.base = j.base;
    if (j.corner) flat.corner = j.corner;
    if (j.flap !== undefined) flat.flap = j.flap;
    delete j.base;
    delete j.corner;
    delete j.flap;
    const k = d.material.kind;
    (j as Record<string, DesignJoints>)[k] = { ...flat, ...((j as Record<string, DesignJoints>)[k] ?? {}) };
  }
  for (const k of Object.keys(j)) if (!KINDS.includes(k as MaterialKind) || !Object.keys((j as Record<string, object>)[k] ?? {}).length) delete (j as Record<string, unknown>)[k];
  if (!Object.keys(j).length) delete d.joints;
}

/** The current material's joint choices (or another material kind's: a board of its own material). */
export function jointsOf(d: Design, kind: MaterialKind = d.material.kind): DesignJoints | undefined {
  return d.joints?.[kind];
}

/** Change the current material's joint choices (an empty set is removed). */
export function patchJoints(d: Design, patch: Partial<Record<keyof DesignJoints, unknown>>) {
  const cur: DesignJoints = { ...jointsOf(d) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined) delete cur[k as keyof DesignJoints];
    else (cur as Record<string, unknown>)[k] = v;
  }
  const all = { ...d.joints };
  if (Object.keys(cur).length) all[d.material.kind] = cur;
  else delete all[d.material.kind];
  if (Object.keys(all).length) d.joints = all;
  else delete d.joints;
}

/**
 * Why a group's list does not show the design's choice, for the settings card:
 * the current material's choice does not fit any of these joints (`here`), or
 * another material's choice is kept for when the design goes back to it
 * (`other`). Null: nothing to say.
 */
export function inactiveChoice(d: Design, group: JointGroup): { kind: ConnectionKind; used: ConnectionKind | undefined; material: MaterialKind | null } | null {
  const kinds = groupKinds(d, group);
  const used = groupShown(d, group);
  const mine = jointsOf(d)?.[group];
  if (mine) return kinds.includes(mine) ? null : { kind: mine, used, material: null };
  for (const k of KINDS) {
    if (k === d.material.kind) continue;
    const theirs = d.joints?.[k]?.[group];
    if (theirs && !kinds.includes(theirs)) return { kind: theirs, used, material: k };
  }
  return null;
}

/** The group a connection belongs to, or null (a half-lap). */
export function jointGroup(c: Pick<Connection, 'grown' | 'kind' | 'b'>): JointGroup | null {
  if (c.grown) return 'base';
  const type = seamTypeOf(c);
  return type === 'corner' ? 'corner' : type === 'face' ? 'base' : null;
}

/**
 * Kinds this connection may take in a design-wide change (by its angle or seam
 * type and the material). A divider (a grown panel standing in from the edge)
 * takes only the kinds an edge on a face can have.
 */
export function allowedKinds(d: Design, c: Connection): ConnectionKind[] {
  if (!c.grown) return pairKinds(d, c);
  const k = pairKinds(d, c);
  if (!standsOnFace(d, c)) return k;
  const face = seamKinds(matOf(d, c.b.panelId), 'face', matOf(d, c.a.panelId));
  const both = k.filter((x) => face.includes(x));
  return both.length ? both : k;
}

/**
 * Kinds a joint may take by its angle or seam type and the materials of its two
 * boards (milestone 36): the feature-carrying board's material decides, and a
 * pair of different materials drops what needs both the same (fingers, folds).
 */
export function pairKinds(d: Design, c: Pick<Connection, 'grown' | 'angle' | 'kind' | 'a' | 'b'>): ConnectionKind[] {
  const ma = matOf(d, c.a.panelId), mb = matOf(d, c.b.panelId);
  if (c.grown) return ma === mb ? connectionsFor(mb, c.angle) : connectionsForPair(mb, ma, c.angle);
  return seamKinds(ma, seamTypeOf(c), mb);
}

/** The material carrying a joint's features: the grown board, or a closing seam's first edge. */
export function ownerMaterial(d: Design, c: Pick<Connection, 'grown' | 'a' | 'b'>): MaterialProfile {
  return matOf(d, c.grown ? c.b.panelId : c.a.panelId);
}

/** The kinds a new joint of the group could take, in the material's order. */
function groupDefaults(d: Design, group: JointGroup): ConnectionKind[] {
  const m = d.material;
  return group === 'corner' ? seamKinds(m, 'corner') : [...connectionsFor(m, 90), ...seamKinds(m, 'face')];
}

/** Connections in a group. */
export function groupConnections(d: Design, group: JointGroup): Connection[] {
  return Object.values(d.connections).filter((c) => jointGroup(c) === group);
}

/**
 * The kinds offered for a group: those allowed for at least one of its joints
 * (all a new joint could take while the group is empty), without repeats, in
 * the material's order.
 */
export function groupKinds(d: Design, group: JointGroup): ConnectionKind[] {
  const cs = groupConnections(d, group);
  const order = [...groupDefaults(d, group), ...cs.flatMap((c) => allowedKinds(d, c))];
  const ok = new Set(cs.length ? cs.flatMap((c) => allowedKinds(d, c)) : order);
  return [...new Set(order)].filter((k) => ok.has(k));
}

/** The design's default kind for a group (the choices of `kind`, a material kind; default the working material's), if set and among `allowed`. */
export function designKind(d: Design, group: JointGroup, allowed: ConnectionKind[], kind?: MaterialKind): ConnectionKind | undefined {
  const k = jointsOf(d, kind)?.[group];
  return k && allowed.includes(k) ? k : undefined;
}

/** What a group's list shows: the design's choice, or the kind most of its joints have (ties: the material's order). */
export function groupShown(d: Design, group: JointGroup): ConnectionKind | undefined {
  const kinds = groupKinds(d, group);
  const set = designKind(d, group, kinds);
  if (set) return set;
  const n = new Map<ConnectionKind, number>();
  for (const c of groupConnections(d, group)) n.set(c.kind, (n.get(c.kind) ?? 0) + 1);
  let best: ConnectionKind | undefined, most = 0;
  for (const k of kinds) if ((n.get(k) ?? 0) > most) [best, most] = [k, n.get(k)!];
  return best ?? kinds[0];
}

/** Glue flap width for a joint: its own, else the design's, else the material's. */
export function flapWidth(d: Design, c: Pick<Connection, 'flap'> & Partial<Pick<Connection, 'grown' | 'a' | 'b'>>): number {
  const m = c.a && c.b ? ownerMaterial(d, c as Connection) : d.material;
  return c.flap ?? jointsOf(d, m.kind)?.flap ?? autoFlap(m);
}

/** A grown panel standing well in from its parent's edge (a divider): it stands on the face. */
export function standsOnFace(d: Design, c: Pick<Connection, 'grown' | 'offset'> & Partial<Pick<Connection, 'a'>>): boolean {
  const m = c.a ? matOf(d, c.a.panelId) : d.material;
  return c.grown && c.offset > 2 * m.thickness + minWeb(m);
}

/** The order joints are tried where an edge meets a face: tabs and slots, a glue flap, then a slide fit (no joint) last. */
export const FACE_ORDER: ConnectionKind[] = ['tabslot', 'glue', 'slide'];

/** Kinds for a new divider (an edge standing on a face at 90°), the design's choice first when allowed. */
export function dividerKind(d: Design, baseId?: string): ConnectionKind {
  const m = baseId ? matOf(d, baseId) : d.material;
  const face = seamKinds(m, 'face');
  const ok = connectionsFor(m, 90).filter((k) => face.includes(k));
  return designKind(d, 'base', ok, m.kind) ?? FACE_ORDER.find((k) => ok.includes(k)) ?? ok[0] ?? 'butt';
}

/** A new tray's joints: the design's choices where a tray allows them, else the material's. */
export function newTrayKinds(d: Design, baseId?: string): { wallKind: ConnectionKind; cornerKind: ConnectionKind } {
  const m = baseId ? matOf(d, baseId) : d.material;
  const k = trayKinds(m);
  return { wallKind: designKind(d, 'base', connectionsFor(m, 90), m.kind) ?? k.wallKind, cornerKind: designKind(d, 'corner', seamKinds(m, 'corner'), m.kind) ?? k.cornerKind };
}
