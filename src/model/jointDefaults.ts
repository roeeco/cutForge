// Design-wide joint kinds (milestone 23). Joints fall in two groups: *wall to
// base* (a grown panel on the panel it grows from, and an edge standing on a
// face: dividers, edge-on-face seams) and *corners* (wall-to-wall closing
// seams). Crossing half-laps are in neither. Each group's list offers the
// kinds the material allows for at least one of its joints; the design's
// choice is the default for new joints of that group where allowed.
import type { Connection, ConnectionKind, Design, DesignJoints, MaterialKind } from './types';
import { connectionsFor, minWeb } from './materials';
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

/** The current material's joint choices. */
export function jointsOf(d: Design): DesignJoints | undefined {
  return d.joints?.[d.material.kind];
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
  if (!c.grown) return seamKinds(d.material, seamTypeOf(c));
  const k = connectionsFor(d.material, c.angle);
  if (!standsOnFace(d, c)) return k;
  const face = seamKinds(d.material, 'face');
  const both = k.filter((x) => face.includes(x));
  return both.length ? both : k;
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

/** The design's default kind for a group, if set and among `allowed`. */
export function designKind(d: Design, group: JointGroup, allowed: ConnectionKind[]): ConnectionKind | undefined {
  const k = jointsOf(d)?.[group];
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
export function flapWidth(d: Design, c: Pick<Connection, 'flap'>): number {
  return c.flap ?? jointsOf(d)?.flap ?? autoFlap(d.material);
}

/** A grown panel standing well in from its parent's edge (a divider): it stands on the face. */
export function standsOnFace(d: Design, c: Pick<Connection, 'grown' | 'offset'>): boolean {
  return c.grown && c.offset > 2 * d.material.thickness + minWeb(d.material);
}

/** Kinds for a new divider (an edge standing on a face at 90°), the design's choice first when allowed. */
export function dividerKind(d: Design): ConnectionKind {
  const face = seamKinds(d.material, 'face');
  const ok = connectionsFor(d.material, 90).filter((k) => face.includes(k));
  return designKind(d, 'base', ok) ?? (d.material.kind === 'plywood' ? 'tabslot' : 'butt');
}

/** A new tray's joints: the design's choices where a tray allows them, else the material's. */
export function newTrayKinds(d: Design): { wallKind: ConnectionKind; cornerKind: ConnectionKind } {
  const k = trayKinds(d.material);
  return { wallKind: designKind(d, 'base', connectionsFor(d.material, 90)) ?? k.wallKind, cornerKind: designKind(d, 'corner', seamKinds(d.material, 'corner')) ?? k.cornerKind };
}
