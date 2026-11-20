// Promise checks (milestone 134, QA_FIX_PLAN.md O1): what the user was promised, not only that the design holds
// together. Shared by the QA repros (tests/qa) and the model fuzzer (tests/fuzz/fuzz.ts).
import * as ops from '../../src/model/ops';
import { allowedKinds, groupMix, groupOf, groupShown, ownerMaterial, type JointGroup } from '../../src/model/jointDefaults';
import { validate } from '../../src/model/validate';
import { blocking } from '../../src/easy/fix';
import type { Design } from '../../src/model/types';

type Kind = Design['connections'][string]['kind'];

/** What the Workshop editor runs after every change (the store's `guarded`): solve, then join. */
export function settle(d: Design) {
  ops.solve(d);
  ops.autoConnect(d);
}

/**
 * A joint's key: the two boards it joins. The editor's join step (`autoConnect`) deletes joints and makes them again
 * under new ids, sometimes on other edges (a corner becomes a half-lap between the walls' faces), so a promise is
 * followed by the boards, not by the id or the edge.
 */
export function jointKey(c: Design['connections'][string]): string {
  return [c.a.panelId, c.b.panelId].sort().join('|');
}
const byKey = (d: Design) => new Map(Object.values(d.connections).map((c) => [jointKey(c), c]));

/** The joints `setAllJoints(d, group, kind)` promises to change (keys): in the group, of the working material, and allowed that kind. */
export function promisedJoints(d: Design, group: JointGroup, kind: Kind): string[] {
  return Object.values(d.connections)
    .filter((c) => groupOf(d, c) === group && ownerMaterial(d, c).kind === d.material.kind && allowedKinds(d, c).includes(kind))
    .map(jointKey);
}

/** The keys of a group's joints of the working material. */
export function groupKeys(d: Design, group: JointGroup): string[] {
  return Object.values(d.connections).filter((c) => groupOf(d, c) === group && ownerMaterial(d, c).kind === d.material.kind).map(jointKey);
}

export type JointOutcome = {
  result: ops.JointChange;
  /** Joints the change promised. */
  promised: string[];
  /** Promised joints that ended with another kind, as `id=kind`. */
  wrong: string[];
  /** Promised joints that are gone after the change. */
  gone: string[];
};

/** Change a group as the design card does (`setAllJoints`, then the editor's solve and join) and see what was kept of the promise. */
export function changeGroup(d: Design, group: JointGroup, kind: Kind): JointOutcome {
  const promised = promisedJoints(d, group, kind);
  const result = ops.setAllJoints(d, group, kind);
  settle(d);
  return { result, promised, ...broken(d, promised, kind) };
}

/** Which joints (keys) do not have `kind` now, and which are gone. */
export function broken(d: Design, keys: string[], kind: Kind): { wrong: string[]; gone: string[] } {
  const now = byKey(d);
  const wrong: string[] = [], gone: string[] = [];
  for (const k of keys) {
    const c = now.get(k);
    if (!c) gone.push(k);
    else if (c.kind !== kind) wrong.push(`${k}=${c.kind}`);
  }
  return { wrong, gone };
}

/** The kind of each joint (by key) now; `undefined` when it is gone. */
export function kindsOf(d: Design, keys: string[]): (Kind | undefined)[] {
  const now = byKey(d);
  return keys.map((k) => now.get(k)?.kind);
}

/**
 * A list tells the truth: the kind a group's list shows (`groupShown`) is the kind of every joint the group
 * covers. Returns the joints that have another kind (`key=kind`); empty when the list is true. `also` adds joints
 * (keys) that were in the group before a change: a joint that left the group is still one the user chose for.
 */
export function shownLies(d: Design, group: JointGroup, also: string[] = []): string[] {
  const shown = groupShown(d, group);
  // a list that says *Mixed* (milestone 135) is true when its joints do differ
  if (shown === undefined) return groupMix(d, group).length > 1 ? [] : ['(no kind shown)'];
  const now = byKey(d);
  const out: string[] = [];
  for (const k of new Set([...groupKeys(d, group), ...also])) {
    const c = now.get(k);
    if (c && c.kind !== shown) out.push(`${k}=${c.kind}`);
  }
  return out;
}

/** Blocking problems, as the *Ready to cut* badge and Guided's *Send* count them. */
export const blockers = (d: Design) => validate(d).filter(blocking);
