// A box's lid, one way (LIDS_LINES_PROJECTS_PLAN.md §4, §10.4; milestone 73).
// The engine has several kinds of lid, each stored its own way: a telescoping
// cap (a second tray, `Tray.lidOf`, milestone 71), a lid folded off the back
// wall (`Tray.top 'tuck'`, 67–68: a tuck lid on card and corrugated, a living
// hinge on plywood), an arched lid (71), the four flaps of a carton's top (68),
// or a board grown across the top with a plywood joint (*Fixed*: it cannot
// open). `boxLid` reads what a box has; `setBoxLid` replaces it with another,
// in one edit, carrying the shapes on the old lid's top to the new one. Both
// modes and Quick build's Wall / lid use these, so a lid is made one way.
import type { Design, Detail, Panel } from '../model/types';
import { addArchedLid, addLid, parentConnection, setTrayEnds, solve } from '../model/ops';
import { lidOn, lidOnFrame } from '../model/lid';
import { archLids, sealFor, sealOf } from '../model/closures';
import { topLidId, trayRing } from '../model/cartons';
import { matOf } from '../model/materials';
import { removePanelRecord } from '../model/place';
import { toLocal, toWorld } from '../model/frame';
import { bandOf, foldRadius } from '../model/bands';
import type { MsgKey } from '../i18n';

/** What a box's lid is. */
export type BoxLid =
  | { kind: 'none' }
  /** A lid of its own that lifts off: in milestone 73 the cap (a shallow tray over the box). */
  | { kind: 'liftoff'; style: 'cap'; tray: string; top: string }
  /** Folded off the back wall's top: a tuck or tab lid on card and corrugated, a living hinge on plywood. */
  | { kind: 'hinged'; lid: string; living: boolean }
  | { kind: 'arched'; lid: string; flap: string }
  /** A board grown across the top with a joint that does not fold: it closes the box for good. */
  | { kind: 'fixed'; lid: string }
  /** A carton's top closed by four flaps. */
  | { kind: 'flaps' };

/** What can be chosen in the *Lid* section. */
export type LidChoice = 'none' | 'liftoff' | 'hinged' | 'arched';

const topEdge = (edge: string) => edge.split('#')[0] === 'e2';

/** The boards grown off `id`, and theirs (not `id` itself). */
function grownOff(d: Design, id: string): string[] {
  const out: string[] = [];
  const todo = [id];
  while (todo.length) {
    const p = todo.pop()!;
    for (const c of Object.values(d.connections))
      if (c.grown && c.a.panelId === p && d.panels[c.b.panelId] && !out.includes(c.b.panelId)) {
        out.push(c.b.panelId);
        todo.push(c.b.panelId);
      }
  }
  return out;
}

/** The lid a box's tray has. */
export function boxLid(d: Design, trayId: string): BoxLid {
  const t = d.trays?.[trayId];
  if (!t || t.lidOf) return { kind: 'none' };
  const cap = lidOn(d, trayId);
  if (cap && d.panels[cap.baseId]) return { kind: 'liftoff', style: 'cap', tray: cap.id, top: cap.baseId };
  if (t.top === 'tuck' && d.panels[topLidId(t)]) return { kind: 'hinged', lid: topLidId(t), living: matOf(d, topLidId(t)).kind === 'plywood' };
  if (t.top === 'seal') return { kind: 'flaps' };
  const ring = trayRing(d, t).map((r) => r.wall);
  for (const a of archLids(d)) {
    const hinge = parentConnection(d, a.lid);
    if (hinge && ring.includes(hinge.a.panelId)) return { kind: 'arched', lid: a.lid, flap: a.flap };
  }
  // a board grown from a wall's top edge, square, across to the far wall
  for (const c of Object.values(d.connections)) {
    if (!c.grown || !ring.includes(c.a.panelId) || !topEdge(c.a.edge) || Math.abs(c.angle - 90) > 1e-6) continue;
    const L = d.panels[c.b.panelId];
    if (!L) continue;
    if (c.kind === 'fold' && sealOf(d, L.id)) return { kind: 'hinged', lid: L.id, living: matOf(d, L.id).kind === 'plywood' };
    if (c.kind !== 'fold' && sealFor(d, L, c.a.panelId, c.id)) return { kind: 'fixed', lid: L.id };
  }
  return { kind: 'none' };
}

/** The boards that make a box's lid (to remove it, or to show its section on their cards). */
export function lidParts(d: Design, lid: BoxLid): string[] {
  if (lid.kind === 'none' || lid.kind === 'flaps') return [];
  if (lid.kind === 'liftoff') return [lid.top, ...grownOff(d, lid.top)];
  return [lid.lid, ...grownOff(d, lid.lid)];
}

/** The board that is a lid's top: where its shapes are. */
function lidTop(lid: BoxLid): string | null {
  return lid.kind === 'liftoff' ? lid.top : lid.kind === 'hinged' || lid.kind === 'arched' || lid.kind === 'fixed' ? lid.lid : null;
}

/** The box tray a board belongs to as a box or as its lid (null when it is neither). */
export function boxOfPanel(d: Design, panelId: string): string | null {
  for (const t of Object.values(d.trays ?? {})) {
    if (t.lidOf) continue;
    if (t.baseId === panelId) return t.id;
    if (lidParts(d, boxLid(d, t.id)).includes(panelId)) return t.id;
  }
  return null;
}


/** Where a lid's top is when the box is closed: a lid of its own lies beside its box (milestone 76), so its pose on the box. */
function topPose(d: Design, trayId: string, lid: BoxLid, P: Panel): Panel['frame'] {
  return (lid.kind === 'liftoff' && lidOnFrame(d, P, d.trays[trayId])) || P.frame;
}

/** Take a box's lid off; the shapes on its top are returned in world space with their own settings. */
function removeLid(d: Design, trayId: string, lid: BoxLid): { dt: Detail; at: [number, number, number] }[] {
  const t = d.trays[trayId];
  const top = lidTop(lid);
  const P = top ? d.panels[top] : undefined;
  const F = P && topPose(d, trayId, lid, P);
  const carried = P && F ? P.details.map((dt) => ({ dt, at: toWorld(F, dt.cx, dt.cy) as [number, number, number] })) : [];
  if (P) P.details = [];
  // a tuck top is kept by its tray: what was grown off it goes first, then the tray lets it go
  if (lid.kind === 'hinged' && t.top === 'tuck') {
    for (const id of grownOff(d, lid.lid)) removePanelRecord(d, id);
    setTrayEnds(d, trayId, { top: 'open' });
  }
  else if (lid.kind === 'flaps') setTrayEnds(d, trayId, { top: 'open' });
  else if (lid.kind !== 'none') {
    if (lid.kind === 'liftoff') delete d.trays[lid.tray];
    for (const id of lidParts(d, lid)) removePanelRecord(d, id);
    solve(d);
  }
  return carried;
}

/**
 * Give a box the lid chosen (one edit; the caller's `apply` makes it one undo
 * step). The lid it had goes, with every board and joint of it; the shapes on
 * its top go onto the new lid's top where they were (by their place above the
 * box), and those that do not fit are dropped and counted.
 */
export function setBoxLid(d: Design, trayId: string, choice: LidChoice): { ok: boolean; dropped: number } {
  const t = d.trays?.[trayId];
  if (!t || t.lidOf) return { ok: false, dropped: 0 };
  const cur = boxLid(d, trayId);
  if (cur.kind === choice) return { ok: true, dropped: 0 };
  // a carton closes with its tuck top or not at all
  if (t.base === 'open' && choice !== 'hinged' && choice !== 'none') return { ok: false, dropped: 0 };
  const carried = removeLid(d, trayId, cur);
  if (choice === 'liftoff') addLid(d, trayId);
  else if (choice === 'hinged') setTrayEnds(d, trayId, { top: 'tuck' });
  else if (choice === 'arched') addArchedLid(d, trayId);
  const now = boxLid(d, trayId);
  const top = lidTop(now);
  const P = top ? d.panels[top] : undefined;
  let dropped = 0;
  for (const { dt, at } of carried) {
    if (!P) {
      dropped++;
      continue;
    }
    const q = toLocal(topPose(d, trayId, now, P), at);
    const hw = dt.w / 2, hh = dt.h / 2;
    if (q.x - hw < 0 || q.y - hh < 0 || q.x + hw > P.w || q.y + hh > P.h) {
      dropped++;
      continue;
    }
    P.details.push({ ...dt, cx: q.x, cy: q.y });
  }
  if (carried.length) solve(d);
  return { ok: now.kind === choice, dropped };
}

/**
 * Why a lid cannot be chosen for this box (null when it can). A lid that
 * lifts off can always be made; one that folds is tried on a copy of the
 * design, and refused when it does not close the box or a bend of it does not
 * fit or reach (a living hinge too tight for a small plywood box). Only the
 * new lid's bends are checked, not the whole design: the card asks on every
 * edit.
 */
export function lidWhy(d: Design, trayId: string, choice: LidChoice): MsgKey | null {
  const t = d.trays?.[trayId];
  if (!t || t.lidOf) return 'lid.why.none';
  if (choice === 'none') return null;
  const carton = t.base === 'open';
  if (carton && choice !== 'hinged') return 'lid.why.carton';
  if (choice === 'arched' && t.top) return 'lid.why.arch';
  if (choice === 'liftoff' || boxLid(d, trayId).kind === choice) return null;
  // what the answer depends on: the box's base, walls, tray settings and material (not shapes, names or other boards)
  const key = boxKey(d, trayId) + '|' + choice;
  if (whyCache.has(key)) return whyCache.get(key)!;
  const why = probeWhy(d, trayId, choice);
  if (whyCache.size > 200) whyCache.delete(whyCache.keys().next().value!);
  whyCache.set(key, why);
  return why;
}

const whyCache = new Map<string, MsgKey | null>();

/** The box's own geometry and settings, as a key. */
function boxKey(d: Design, trayId: string): string {
  const t = d.trays[trayId];
  const B = d.panels[t.baseId];
  const walls = trayRing(d, t).map((r) => {
    const W = d.panels[r.wall];
    const c = parentConnection(d, r.wall);
    return W && [r.edge, W.w, W.h, W.sketch, W.customHeight, W.material, c?.kind, c?.offset];
  });
  const m = matOf(d, t.baseId);
  return JSON.stringify([{ ...t, fixes: undefined, fixPlan: undefined }, B.w, B.h, B.sketch, B.material, m, walls]);
}

function probeWhy(d: Design, trayId: string, choice: LidChoice): MsgKey | null {
  const t = d.trays[trayId];
  const no: MsgKey = choice === 'arched' ? 'lid.why.arch' : matOf(d, t.baseId).kind === 'plywood' ? 'lid.why.hingeSmall' : 'lid.why.cannot';
  const probe = structuredClone(d) as Design;
  if (!setBoxLid(probe, trayId, choice).ok) return no;
  const lid = boxLid(probe, trayId);
  // a hinged lid closes the box (it reaches the far wall)
  if (lid.kind === 'hinged' && !sealOf(probe, lid.lid)) return no;
  for (const id of lidParts(probe, lid)) {
    const c = parentConnection(probe, id);
    const b = c?.kind === 'fold' ? bandOf(probe, c) : null;
    if ((c?.kind === 'fold' && matOf(probe, id).kind === 'plywood' && foldRadius(probe, c) <= 1e-6) || (b && (!b.fits || b.pattern.why))) return no;
  }
  return null;
}

/** The lid Quick build's Wall / lid makes when its ghost would close a box: lifts off on plywood; hinged on card and corrugated where it can. */
export function wallLidChoice(d: Design, trayId: string): LidChoice {
  const t = d.trays?.[trayId];
  if (!t) return 'liftoff';
  if (t.base === 'open') return 'hinged';
  return matOf(d, t.baseId).kind !== 'plywood' && !lidWhy(d, trayId, 'hinged') ? 'hinged' : 'liftoff';
}

/**
 * Quick build's Wall / lid (milestone 73): does this ghost, grown off a box
 * wall's top edge, close the box? Then ✓ makes the box's lid (`setBoxLid`
 * with this choice) and never a board jointed shut. Null otherwise.
 */
export function wallClosesBox(d: Design, wallId: string, edge: string, ghost: Pick<Panel, 'id' | 'w' | 'h' | 'frame'> | null): { tray: string; choice: LidChoice } | null {
  const tr = ghost ? boxOfWallTop(d, wallId, edge) : null;
  return tr && sealFor(d, ghost!, wallId, 'ghost') ? { tray: tr, choice: wallLidChoice(d, tr) } : null;
}

/** The box a tray wall belongs to, when `edge` is its top edge (for Wall / lid). */
export function boxOfWallTop(d: Design, wallId: string, edge: string): string | null {
  if (!topEdge(edge)) return null;
  const c = parentConnection(d, wallId);
  const t = c?.trayId ? d.trays?.[c.trayId] : undefined;
  return t && !t.lidOf ? t.id : null;
}
