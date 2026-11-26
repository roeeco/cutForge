// Joint kinds offered only where the design's construction takes them (26 November, the owner: "make sure chosen
// panel and joint connection types are indeed facilitated in the selected dieline / panel construction").
//
// The lists used to offer every kind a joint's material and angle allow (`groupKinds`, `allowedKinds`). That is not
// the same as what the box is built as: a carton's net keeps its walls and corners folded, so *Corners → Glue* changed
// one seam of four and left the rest; on a board-built box *Wall to base → Butt* left boards overlapping, and tabs
// on a shallow scoop tray cut slots too near an edge. A kind is now tried on a copy of the design before it is
// offered, the way a lid is (`lidWhy`): it is offered when at least one of the joints it is for takes it and it leaves
// no new problem in the design's checks; otherwise it is greyed with the reason. Answers are kept per design state
// (the store's designs are immutable), so a list asks once per edit.
import type { ConnectionKind, Design } from '../model/types';
import type { MsgKey } from '../i18n';
import { groupShown, ownGroupJoints, type JointGroup } from '../model/jointDefaults';
import { autoConnect, pairKey, setAllJoints, setConnection } from '../model/ops';
import { validate, type Issue } from '../model/validate';
import { NOTE_KEYS } from './notes';

/** Why a kind is not offered: the construction keeps its own joints there, or the kind would leave a problem (the check that would fail). */
export type KindWhy = { key: MsgKey; issue?: Issue };

const sig = (i: Issue) => `${i.key}|${JSON.stringify(i.vars)}`;
const problems = (d: Design) => validate(d).filter((i) => !NOTE_KEYS.has(i.key));

const had = new WeakMap<Design, Set<string>>();
/** The design's own problems before any change (so only what a kind adds counts against it). */
function problemsOf(d: Design): Set<string> {
  let s = had.get(d);
  if (!s) had.set(d, (s = new Set(problems(d).map(sig))));
  return s;
}

/** The first problem `after` has that `d` did not. */
function added(d: Design, after: Design): Issue | undefined {
  const before = problemsOf(d);
  return problems(after).find((i) => !before.has(sig(i)));
}

const groupCache = new WeakMap<Design, Map<string, KindWhy | null>>();

/**
 * Why a design-wide joint choice (*Wall to base* or *Corners*) is not offered for this design, or null when it is:
 * tried on a copy, it must be taken by at least one joint of the group (none: the box's construction keeps its own
 * there, `joints.why.held`) and leave no new problem (`joints.why.problem`, with the check). The kind the group
 * already has is always offered.
 */
export function groupKindWhy(d: Design, group: JointGroup, kind: ConnectionKind): KindWhy | null {
  if (groupShown(d, group) === kind) return null;
  let m = groupCache.get(d);
  if (!m) groupCache.set(d, (m = new Map()));
  const key = `${group}|${kind}`;
  if (m.has(key)) return m.get(key)!;
  const probe = structuredClone(d) as Design;
  setAllJoints(probe, group, kind);
  autoConnect(probe);
  const own = ownGroupJoints(probe, group);
  let why: KindWhy | null = null;
  if (own.length && !own.some((c) => c.kind === kind)) why = { key: 'joints.why.held' };
  else {
    const issue = added(d, probe);
    if (issue) why = { key: 'joints.why.problem', issue };
  }
  m.set(key, why);
  return why;
}

const connCache = new WeakMap<Design, Map<string, KindWhy | null>>();

/**
 * Why one joint's card does not offer a kind, or null when it does: tried on a copy, the joint must keep the kind
 * (the box's net or fixes did not set it back, `conn.why.held`) and still join its boards (`conn.why.cannot`), and
 * leave no new problem (`joints.why.problem`). Its own kind is always offered.
 */
export function jointKindWhy(d: Design, connId: string, kind: ConnectionKind): KindWhy | null {
  const c = d.connections[connId];
  if (!c || c.kind === kind) return null;
  let m = connCache.get(d);
  if (!m) connCache.set(d, (m = new Map()));
  const key = `${connId}|${kind}`;
  if (m.has(key)) return m.get(key)!;
  const probe = structuredClone(d) as Design;
  setConnection(probe, connId, { kind });
  autoConnect(probe);
  // the joint between the same two boards (a seam made again by `autoConnect` has a new id)
  const pair = pairKey(c.a.panelId, c.b.panelId);
  const after = probe.connections[connId] ?? Object.values(probe.connections).find((x) => x.grown === c.grown && pairKey(x.a.panelId, x.b.panelId) === pair);
  let why: KindWhy | null = null;
  if (!after || after.broken) why = { key: 'conn.why.cannot' };
  else if (after.kind !== kind) why = { key: 'conn.why.held' };
  else {
    const issue = added(d, probe);
    if (issue) why = { key: 'joints.why.problem', issue };
  }
  m.set(key, why);
  return why;
}
